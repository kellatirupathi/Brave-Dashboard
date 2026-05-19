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
- Respond in STRICT JSON only, no markdown fences, with this exact shape:
  { "answer": string, "suggestions": string[] }
  where "suggestions" is 2 to 3 short follow-up questions related to the user's question (each under 70 characters). If you cannot think of follow-ups, use an empty array.

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
  try {
    const obj = JSON.parse(unfenced) as unknown;
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
      return { answer, suggestions };
    }
  } catch {
    // fall through
  }
  return { answer: trimmed, suggestions: [] };
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
