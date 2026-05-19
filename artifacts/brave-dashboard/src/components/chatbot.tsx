import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
  suggestions?: string[];
};

type AskResponse = {
  answer: string;
  suggestions?: string[];
  error?: string;
};

const DEFAULT_GREETING =
  "Hi! I'm the BRAVE programme assistant. Ask me anything about teams, projects, revenue, Demo Day, or how the dashboard works.";

const DEFAULT_SUGGESTIONS = [
  "How is a team formed?",
  "What counts as Demo Day eligibility?",
  "How does revenue get verified?",
];

export function Chatbot({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: DEFAULT_GREETING,
      suggestions: DEFAULT_SUGGESTIONS,
    },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return undefined;
    // Tiny delay so the panel is mounted before focusing.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;

    const nextHistory: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextHistory);
    setInput("");
    setSending(true);

    try {
      // Convert messages -> server history (strip the leading greeting if it's
      // the very first assistant message, since it wasn't actually said by the
      // model and would just waste tokens).
      const history = nextHistory
        .slice(0, -1)
        .filter(
          (m, i) => !(i === 0 && m.role === "assistant" && m.content === DEFAULT_GREETING),
        )
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chatbot/ask", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = (await res.json().catch(() => null)) as AskResponse | null;
      const answer =
        data?.answer ||
        "Sorry — I couldn't get a reply. Please try again in a moment.";
      const suggestions = Array.isArray(data?.suggestions)
        ? data!.suggestions!.filter((s) => typeof s === "string" && s.trim())
        : [];
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, suggestions },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry — the assistant is unreachable right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    send(input);
  };

  const isDark = variant === "dark";

  return (
    <>
      {/* Floating launcher button (bottom-right). */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open BRAVE assistant"
          data-testid="button-open-chatbot"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            background:
              "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
            boxShadow: "0 10px 30px -8px rgba(212,64,47,0.55)",
          }}
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel. */}
      {open && (
        <div
          role="dialog"
          aria-label="BRAVE assistant"
          data-testid="chatbot-panel"
          className="fixed bottom-6 right-6 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            height: "min(78vh, 580px)",
            background: isDark ? "#1a0a08" : "#ffffff",
            borderColor: isDark
              ? "rgba(247,172,43,0.25)"
              : "rgba(212,64,47,0.18)",
            color: isDark ? "#fff3df" : "#111",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              background:
                "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
              color: "#fff",
            }}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">
                  BRAVE Assistant
                </div>
                <div className="text-[11px] opacity-90">
                  Ask anything about the programme
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close BRAVE assistant"
              data-testid="button-close-chatbot"
              className="rounded-full p-1 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
            style={{
              background: isDark ? "#0f0604" : "#fafafa",
            }}
          >
            {messages.map((m, i) => (
              <MessageRow
                key={i}
                msg={m}
                isDark={isDark}
                onPickSuggestion={(q) => send(q)}
                disabled={sending}
                isLast={i === messages.length - 1}
              />
            ))}
            {sending && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm"
                  style={{
                    background: isDark
                      ? "rgba(247,172,43,0.12)"
                      : "rgba(212,64,47,0.06)",
                    color: isDark ? "#fff3df" : "#111",
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    <Dot />
                    <Dot delay="120ms" />
                    <Dot delay="240ms" />
                    <span className="ml-2 text-xs opacity-70">one sec…</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t px-3 py-2"
            style={{
              borderColor: isDark
                ? "rgba(247,172,43,0.18)"
                : "rgba(0,0,0,0.08)",
              background: isDark ? "#1a0a08" : "#fff",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the BRAVE assistant…"
              disabled={sending}
              data-testid="input-chatbot"
              className="flex-1 rounded-full border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                background: isDark ? "rgba(255,243,223,0.06)" : "#fff",
                color: isDark ? "#fff3df" : "#111",
                borderColor: isDark
                  ? "rgba(247,172,43,0.25)"
                  : "rgba(0,0,0,0.12)",
              }}
              maxLength={1500}
            />
            <button
              type="submit"
              aria-label="Send"
              data-testid="button-send-chatbot"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{
                background:
                  "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
              }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <style>{`
        @keyframes brave-chatbot-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{
        background: "#d4402f",
        animation: "brave-chatbot-dot 1.2s infinite ease-in-out",
        animationDelay: delay,
      }}
    />
  );
}

function MessageRow({
  msg,
  isDark,
  onPickSuggestion,
  disabled,
  isLast,
}: {
  msg: ChatMessage;
  isDark: boolean;
  onPickSuggestion: (q: string) => void;
  disabled: boolean;
  isLast: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[88%]">
        <div
          className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
            isUser ? "rounded-br-sm" : "rounded-bl-sm"
          }`}
          style={
            isUser
              ? {
                  background:
                    "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
                  color: "#fff",
                }
              : {
                  background: isDark
                    ? "rgba(247,172,43,0.12)"
                    : "rgba(212,64,47,0.06)",
                  color: isDark ? "#fff3df" : "#111",
                }
          }
          data-testid={isUser ? "chatbot-user-message" : "chatbot-bot-message"}
        >
          {msg.content}
        </div>
        {!isUser && isLast && msg.suggestions && msg.suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => onPickSuggestion(s)}
                data-testid={`chatbot-suggestion-${i}`}
                className="rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50"
                style={{
                  borderColor: isDark
                    ? "rgba(247,172,43,0.35)"
                    : "rgba(212,64,47,0.35)",
                  color: isDark ? "#fff3df" : "#d4402f",
                  background: isDark
                    ? "rgba(247,172,43,0.06)"
                    : "rgba(212,64,47,0.04)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Chatbot;
