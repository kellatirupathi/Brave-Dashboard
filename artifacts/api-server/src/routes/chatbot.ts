import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
// Knowledge base is bundled at build time via esbuild's text loader, so the
// runtime cwd does not matter and the file cannot silently go missing in dist/.
import braveKnowledge from "../../../../brave-knowledge.txt";

const router: IRouter = Router();

// Cerebras (existing — kept)
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_MODEL = "llama3.1-8b";

// Cloudflare Workers AI (NEW — OpenAI-compatible endpoint)
const CLOUDFLARE_BASE_URL = "https://api.cloudflare.com/client/v4/accounts";
const CLOUDFLARE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

const FALLBACK_ERROR =
  "Sorry — I can't reach the BRAVE assistant right now. Please try again in a moment, or contact your Campus Coordinator for help.";

const DEFAULT_SUGGESTIONS_LOGGED_OUT = [
  "How is a team formed?",
  "What counts as AI in the build?",
  "What is Demo Day?",
];

const KNOWLEDGE = braveKnowledge.trim();

const HistoryItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const AskBody = z.object({
  message: z.string().min(1).max(1500),
  // Generous cap so a long conversation is never rejected outright — the
  // route itself only ever uses the last 10 entries (history.slice(-10)).
  // A too-strict limit here previously 400'd every message past ~10 turns.
  history: z.array(HistoryItem).max(100).optional(),
});

const chatbotLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () =>
    process.env.NODE_ENV === "test" ||
    process.env.DISABLE_RATE_LIMIT === "true",
});

function buildSystemPrompt(knowledge: string, loggedIn: boolean): string {
  const scope = loggedIn
    ? `The user IS logged in to the BRAVE dashboard. Give a full, detailed answer using the knowledge below.`
    : `The user is NOT logged in (they are on the public landing or login page). Give a short, helpful general answer. For anything detailed or account-specific (their team, their revenue, their notifications, dashboard pages, etc.), end the answer with one short line telling them to log in to the BRAVE dashboard for full details.`;

  return `You are the BRAVE programme assistant, a friendly chatbot embedded in the BRAVE Dashboard.

${scope}

Rules:
- Answer ONLY using the knowledge below. If the answer is not in it, say you don't have that info and suggest contacting the Campus Coordinator. Never invent facts.
- Keep replies concise and easy to read. Use short paragraphs and bullet points when helpful.
- All amounts are in Indian rupees (₹) using lakh notation (e.g. ₹2,00,000).

OUTPUT FORMAT — STRICT:
Reply with a SINGLE valid JSON object and nothing else. No prose before or after. No markdown code fences. No comments. No template-literal syntax. The very first character of your reply MUST be the opening brace { and the very last character MUST be the closing brace }.

The JSON object must have exactly these two keys (and no others):
{
  "answer": "<your answer as a plain string>",
  "suggestions": ["<follow-up question 1>", "<follow-up question 2>", "<optional follow-up question 3>"]
}

- "answer" is a plain string. Inside it, escape any literal double quotes as \\".
- "suggestions" is an array of 2 or 3 short follow-up questions related to the user's question, each under 70 characters. If you cannot think of follow-ups, use an empty array [].

=== BRAVE KNOWLEDGE BASE ===
${knowledge}
=== END KNOWLEDGE BASE ===`;
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type ParsedReply = { answer: string; suggestions: string[] };

// Returns null when nothing usable could be extracted, so the caller can
// retry the model before giving up.
function parseModelReply(raw: string): ParsedReply | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip ```json fences if the model adds them despite instructions.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // 1) Strict JSON parse first.
  const direct = tryStrictParse(unfenced);
  if (direct) return direct;

  // 2) Extract just the first balanced { ... } block and try again — the
  //    model sometimes prepends a stray character (e.g. ">$" before "answer").
  const braceStart = unfenced.indexOf("{");
  const braceEnd = unfenced.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const slice = unfenced.slice(braceStart, braceEnd + 1);
    const sliced = tryStrictParse(slice);
    if (sliced) return sliced;
  }

  // 3) Regex extraction for malformed JSON like {">${answer": "..."}.
  //    Handles double- or single-quoted keys and string values.
  const extracted = extractByRegex(unfenced);
  if (extracted) return extracted;

  // 4) The model ignored the JSON instruction entirely and just wrote a
  //    plain prose reply. That reply is still a perfectly good answer, so
  //    surface it as-is instead of discarding it. Only do this when the
  //    text has no JSON structure, so we never dump raw JSON into the UI.
  if (!unfenced.includes("{") && !/["']answer["']/i.test(unfenced)) {
    return { answer: unfenced, suggestions: [] };
  }

  // 5) Genuinely unusable (broken JSON we could not salvage).
  return null;
}

// Pulls "answer" / "suggestions" out of malformed JSON via regex. Accepts
// both double- and single-quoted keys and string values.
function extractByRegex(text: string): ParsedReply | null {
  // No leading-quote requirement: tolerates garbled keys the model emits
  // such as ".answer", ">$answer", "];answer", ")))answer".
  let answer = "";
  const dq = /answer\s*["']?\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(text);
  if (dq) {
    answer = unescapeJsonString(dq[1] ?? "").trim();
  } else {
    const sq = /answer\s*["']?\s*:\s*'((?:[^'\\]|\\.)*)'/i.exec(text);
    if (sq) answer = unescapeJsonString(sq[1] ?? "").trim();
  }
  if (!answer) return null;

  const suggestions: string[] = [];
  const block = /["']\s*suggestions\s*["']?\s*:\s*\[([\s\S]*?)\]/i.exec(text);
  if (block) {
    const itemRe = /["']((?:[^"'\\]|\\.)*)["']/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(block[1] ?? "")) !== null) {
      const s = unescapeJsonString(m[1] ?? "").trim();
      if (s) suggestions.push(s);
      if (suggestions.length >= 3) break;
    }
  }
  return { answer, suggestions };
}

// Parses a JSON object reply. The 8B model reliably gets the JSON
// *structure* right but frequently garbles the key name — emitting
// ".answer", ">$answer", "];answer", or even an unrelated key like
// "indices" / "data". So we don't insist on a key literally named
// "answer": we accept any key that contains "answer", and as a last
// resort the first string-valued property that isn't the suggestions.
function tryStrictParse(text: string): ParsedReply | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  // Suggestions: a key named (or containing) "suggestion".
  const suggKey = keys.find((k) => /suggestion/i.test(k));
  const suggestions =
    suggKey && Array.isArray(record[suggKey])
      ? (record[suggKey] as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, 3)
      : [];

  // Answer: exact "answer" key → any key containing "answer" → first
  // string-valued property that isn't the suggestions key.
  const answerKey =
    keys.find((k) => k.toLowerCase() === "answer") ??
    keys.find((k) => /answer/i.test(k)) ??
    keys.find((k) => k !== suggKey && typeof record[k] === "string");
  if (!answerKey) return null;
  const rawAnswer = record[answerKey];
  if (typeof rawAnswer !== "string") return null;
  const answer = rawAnswer.trim();
  if (!answer) return null;
  return { answer, suggestions };
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

// Single round-trip to Cerebras. Returns the raw model content string, or
// null on any transport/HTTP failure (logged by the caller's logger).
async function callCerebras(
  messages: ChatMsg[],
  apiKey: string,
  log: Request["log"],
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch(CEREBRAS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CEREBRAS_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      log.error(
        { status: upstream.status, body: body.slice(0, 500) },
        "Cerebras request failed",
      );
      return null;
    }
    const data = (await upstream.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.error({ err }, "Cerebras request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Single round-trip to Cloudflare Workers AI (OpenAI-compatible endpoint).
// Returns the raw model content string, or null on any transport/HTTP failure
// (logged by the caller's logger). Mirrors callCerebras() shape so the route
// can swap providers behind a closure.
async function callCloudflareAI(
  messages: ChatMsg[],
  apiToken: string,
  accountId: string,
  log: Request["log"],
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstream = await fetch(
      `${CLOUDFLARE_BASE_URL}/${accountId}/ai/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          model: CLOUDFLARE_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 700,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      log.error(
        { status: upstream.status, body: body.slice(0, 500) },
        "Cloudflare request failed",
      );
      return null;
    }
    const data = (await upstream.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.error({ err }, "Cloudflare request failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory cache of the active provider so the chatbot doesn't hit the DB
// on every request. TTL is 30 seconds; the admin PATCH handler also calls
// invalidateChatbotProviderCache() so a switch takes effect immediately.
let cachedProvider: "cloudflare" | "cerebras" | null = null;
let cachedProviderAt = 0;
const PROVIDER_CACHE_TTL_MS = 30_000;

async function getActiveProvider(): Promise<"cloudflare" | "cerebras"> {
  const now = Date.now();
  if (cachedProvider && now - cachedProviderAt < PROVIDER_CACHE_TTL_MS) {
    return cachedProvider;
  }
  try {
    const [row] = await db
      .select({ provider: programmeConfigTable.chatbotProvider })
      .from(programmeConfigTable)
      .limit(1);
    cachedProvider = row?.provider ?? "cloudflare";
  } catch {
    cachedProvider = "cloudflare"; // safe default on DB failure
  }
  cachedProviderAt = now;
  return cachedProvider;
}

export function invalidateChatbotProviderCache(): void {
  cachedProvider = null;
  cachedProviderAt = 0;
}

router.post(
  "/chatbot/ask",
  chatbotLimiter,
  async (req: Request, res): Promise<void> => {
    const parsed = AskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { message, history = [] } = parsed.data;

    const loggedIn = req.isAuthenticated();
    const systemPrompt = buildSystemPrompt(KNOWLEDGE, loggedIn);

    const messages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map<ChatMsg>((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Provider-aware dispatch. The retry-once flow below reuses the SAME
    // provider (Cloudflare or Cerebras) so we never silently switch providers
    // mid-conversation. If creds are missing, surface a clear, provider-
    // specific "not configured" message instead of falling back.
    const provider = await getActiveProvider();

    let upstreamCall: (msgs: ChatMsg[]) => Promise<string | null>;
    if (provider === "cloudflare") {
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!apiToken || !accountId) {
        req.log.warn(
          "Cloudflare creds missing — chatbot cannot reach Cloudflare Workers AI.",
        );
        res.status(200).json({
          answer:
            "The BRAVE assistant is not configured yet (missing Cloudflare credentials). Please ask an admin to add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Replit Secrets, or switch the provider on /admin/config.",
          suggestions: [],
        });
        return;
      }
      upstreamCall = (msgs) =>
        callCloudflareAI(msgs, apiToken, accountId, req.log);
    } else {
      const apiKey = process.env.CEREBRAS_API_KEY;
      if (!apiKey) {
        req.log.warn(
          "CEREBRAS_API_KEY is not set — chatbot cannot reach Cerebras.",
        );
        res.status(200).json({
          answer:
            "The BRAVE assistant is not configured yet (missing CEREBRAS_API_KEY). Please ask an admin to add it in Replit Secrets, or switch the provider on /admin/config.",
          suggestions: [],
        });
        return;
      }
      upstreamCall = (msgs) => callCerebras(msgs, apiKey, req.log);
    }

    try {
      // First attempt.
      let content = await upstreamCall(messages);
      let out = content ? parseModelReply(content) : null;

      // The 8B model occasionally emits malformed JSON. Retry once — a fresh
      // sample (temperature > 0) usually returns clean JSON. When we have the
      // bad reply on hand, feed it back with a firm correction so the retry
      // is far more likely to comply. Retry uses the SAME provider via the
      // upstreamCall closure so we never switch providers mid-conversation.
      if (!out) {
        req.log.warn(
          { contentPreview: (content ?? "").slice(0, 200) },
          "Chatbot reply unparseable — retrying once",
        );
        const retryMessages: ChatMsg[] = [...messages];
        if (content) {
          retryMessages.push({ role: "assistant", content });
          retryMessages.push({
            role: "user",
            content:
              "Your previous reply was not valid JSON. Reply again with ONLY a " +
              "single valid JSON object of the form " +
              '{"answer": "...", "suggestions": ["..."]} and nothing else.',
          });
        }
        content = await upstreamCall(retryMessages);
        out = content ? parseModelReply(content) : null;
      }

      if (!out || !out.answer) {
        res.status(200).json({ answer: FALLBACK_ERROR, suggestions: [] });
        return;
      }

      // Provide gentle defaults for logged-out empty state if model
      // returned no suggestions and there is no prior conversation.
      if (out.suggestions.length === 0 && history.length === 0 && !loggedIn) {
        out.suggestions = DEFAULT_SUGGESTIONS_LOGGED_OUT;
      }
      res.json(out);
    } catch (err) {
      req.log.error({ err }, "Chatbot request errored");
      res.status(200).json({ answer: FALLBACK_ERROR, suggestions: [] });
    }
  },
);

export default router;
