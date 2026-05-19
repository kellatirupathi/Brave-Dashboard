import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
// Knowledge base is bundled at build time via esbuild's text loader, so the
// runtime cwd does not matter and the file cannot silently go missing in dist/.
import braveKnowledge from "../../../../brave-knowledge.txt";

const router: IRouter = Router();

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_MODEL = "llama3.1-8b";

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
  history: z.array(HistoryItem).max(20).optional(),
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

function parseModelReply(raw: string): ParsedReply {
  const trimmed = raw.trim();
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

  // 3) Last-resort regex extraction. Useful when the model emits malformed
  //    JSON like {">${answer": "..."} — we still want to surface the
  //    human-readable answer rather than dumping raw JSON into the UI.
  const answerMatch =
    /"\s*answer\s*"?\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(unfenced);
  if (answerMatch) {
    const answer = unescapeJsonString(answerMatch[1] ?? "").trim();
    const suggestionsBlock =
      /"\s*suggestions\s*"?\s*:\s*\[([\s\S]*?)\]/i.exec(unfenced);
    const suggestions: string[] = [];
    if (suggestionsBlock) {
      const itemRe = /"((?:[^"\\]|\\.)*)"/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(suggestionsBlock[1] ?? "")) !== null) {
        const s = unescapeJsonString(m[1] ?? "").trim();
        if (s) suggestions.push(s);
        if (suggestions.length >= 3) break;
      }
    }
    if (answer) return { answer, suggestions };
  }

  // 4) Give up — never show raw JSON. Return a generic fallback message.
  return {
    answer:
      "Sorry — I couldn't format that reply. Please try asking again, or rephrase your question.",
    suggestions: [],
  };
}

function tryStrictParse(text: string): ParsedReply | null {
  try {
    const obj = JSON.parse(text) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      "answer" in obj &&
      typeof (obj as { answer: unknown }).answer === "string"
    ) {
      const answer = (obj as { answer: string }).answer.trim();
      const rawSugg = (obj as { suggestions?: unknown }).suggestions;
      const suggestions = Array.isArray(rawSugg)
        ? rawSugg
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 3)
        : [];
      if (answer) return { answer, suggestions };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function unescapeJsonString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
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

    const apiKey = process.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      req.log.warn(
        "CEREBRAS_API_KEY is not set — chatbot cannot reach Cerebras.",
      );
      res.status(200).json({
        answer:
          "The BRAVE assistant is not configured yet (missing API key). Please ask an admin to add CEREBRAS_API_KEY in Replit Secrets.",
        suggestions: [],
      });
      return;
    }

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

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
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
      }).finally(() => clearTimeout(timer));

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => "");
        req.log.error(
          { status: upstream.status, body: body.slice(0, 500) },
          "Cerebras request failed",
        );
        res.status(200).json({ answer: FALLBACK_ERROR, suggestions: [] });
        return;
      }

      const data = (await upstream.json().catch(() => null)) as {
        choices?: { message?: { content?: string } }[];
      } | null;
      const content = data?.choices?.[0]?.message?.content ?? "";
      if (!content) {
        res.status(200).json({ answer: FALLBACK_ERROR, suggestions: [] });
        return;
      }

      const out = parseModelReply(content);
      if (!out.answer) {
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
