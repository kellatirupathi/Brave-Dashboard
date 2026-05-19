import { useEffect, useRef, useState } from "react";
import { X, Send, Trash2 } from "lucide-react";

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

const initialMessages = (): ChatMessage[] => [
  {
    role: "assistant",
    content: DEFAULT_GREETING,
    suggestions: DEFAULT_SUGGESTIONS,
  },
];

export function Chatbot({ variant = "light" }: { variant?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

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

  // Close the chat when the user clicks anywhere outside it (but ignore the
  // click that opened it — the launcher itself is outside the panel).
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on Escape too — small quality-of-life win.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const clearConversation = () => {
    setMessages(initialMessages());
    setInput("");
    setSending(false);
    // Re-focus the input so the user can immediately type again.
    setTimeout(() => inputRef.current?.focus(), 50);
  };

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
      {/* Floating launcher button — only visible when the chat is closed. */}
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open BRAVE assistant"
          data-testid="button-open-chatbot"
          className="fixed bottom-6 right-6 z-50 cursor-pointer group focus:outline-none"
        >
          {/* Soft pulsing halo */}
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(125,228,255,0.45) 0%, rgba(26,31,77,0) 70%)",
              animation: "brave-chatbot-pulse 2.4s ease-in-out infinite",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute -inset-1 rounded-full opacity-70"
            style={{
              boxShadow:
                "0 0 0 0 rgba(125,228,255,0.55)",
              animation: "brave-chatbot-ping 2.4s cubic-bezier(0,0,0.2,1) infinite",
            }}
          />
          <span
            className="relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-transform group-hover:scale-110 group-active:scale-95"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, #2a3370 0%, #1a1f4d 70%)",
              boxShadow: "0 12px 32px -8px rgba(26,31,77,0.7)",
            }}
          >
            <BraveLauncherIcon />
          </span>
        </button>
      )}

      {/* Chat panel. */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="BRAVE assistant"
          data-testid="chatbot-panel"
          className="fixed bottom-6 right-6 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          style={{
            height: "min(78vh, 580px)",
            background: isDark ? "#1a0a08" : "#ffffff",
            borderColor: isDark
              ? "rgba(247,172,43,0.25)"
              : "rgba(212,64,47,0.18)",
            color: isDark ? "#fff3df" : "#111",
            transformOrigin: "bottom right",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-3"
            style={{
              background:
                "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
              color: "#fff",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {/* Clear conversation — top LEFT of header. */}
              <button
                type="button"
                onClick={clearConversation}
                aria-label="Clear conversation"
                title="Clear conversation"
                data-testid="button-clear-chatbot"
                className="cursor-pointer rounded-full p-1.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <BraveAssistantAvatar />
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight truncate">
                  BRAVE Assistant
                </div>
                <div className="text-[11px] opacity-90 truncate">
                  Ask anything about the programme
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close BRAVE assistant"
              data-testid="button-close-chatbot"
              className="cursor-pointer rounded-full p-1.5 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-colors"
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
              className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-transform hover:scale-105"
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
        @keyframes brave-chatbot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.25); opacity: 0.15; }
        }
        @keyframes brave-chatbot-ping {
          0% { box-shadow: 0 0 0 0 rgba(247,172,43,0.55); }
          80%, 100% { box-shadow: 0 0 0 18px rgba(247,172,43,0); }
        }
        @keyframes brave-avatar-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          94%, 98% { transform: scaleY(0.1); }
        }
        @keyframes brave-avatar-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes brave-avatar-antenna {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
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

// Animated chat-face avatar shown in the chat header. A friendly little bot
// that gently bobs, blinks its eyes, and has a pulsing antenna so the header
// feels alive instead of static.
function BraveAssistantAvatar() {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20"
      style={{ animation: "brave-avatar-bob 3.2s ease-in-out infinite" }}
    >
      <svg
        viewBox="0 0 32 32"
        width="22"
        height="22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna */}
        <line x1="16" y1="3" x2="16" y2="7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <circle
          cx="16"
          cy="3"
          r="1.6"
          fill="#fff3df"
          style={{
            transformOrigin: "16px 3px",
            animation: "brave-avatar-antenna 1.8s ease-in-out infinite",
          }}
        />
        {/* Head */}
        <rect
          x="5"
          y="8"
          width="22"
          height="18"
          rx="6"
          fill="#fff"
          stroke="#fff"
          strokeWidth="1"
        />
        {/* Cheeks */}
        <circle cx="9" cy="20" r="1.4" fill="#f7ac2b" opacity="0.55" />
        <circle cx="23" cy="20" r="1.4" fill="#f7ac2b" opacity="0.55" />
        {/* Eyes — blink via scaleY keyframes */}
        <g
          style={{
            transformOrigin: "12px 16px",
            animation: "brave-avatar-blink 4.2s ease-in-out infinite",
          }}
        >
          <ellipse cx="12" cy="16" rx="1.6" ry="2.1" fill="#d4402f" />
        </g>
        <g
          style={{
            transformOrigin: "20px 16px",
            animation: "brave-avatar-blink 4.2s ease-in-out infinite",
          }}
        >
          <ellipse cx="20" cy="16" rx="1.6" ry="2.1" fill="#d4402f" />
        </g>
        {/* Smile */}
        <path
          d="M11 21 Q16 24 21 21"
          stroke="#d4402f"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

// Custom launcher icon — a friendly white robot with cyan eyes, antenna,
// and a small "Hi!" speech bubble. Sits on the dark navy launcher circle.
function BraveLauncherIcon() {
  return (
    <svg
      viewBox="0 0 56 56"
      width="44"
      height="44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Antenna */}
      <line
        x1="22"
        y1="6"
        x2="22"
        y2="13"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="22"
        cy="5"
        r="2.2"
        fill="#ffffff"
        style={{
          transformOrigin: "22px 5px",
          animation: "brave-avatar-antenna 1.8s ease-in-out infinite",
        }}
      />

      {/* Robot head */}
      <rect
        x="8"
        y="13"
        width="28"
        height="22"
        rx="7"
        fill="#ffffff"
      />
      {/* Ears */}
      <rect x="5" y="20" width="3" height="9" rx="1.2" fill="#ffffff" />
      <rect x="36" y="20" width="3" height="9" rx="1.2" fill="#ffffff" />
      {/* Eye visor */}
      <rect x="11" y="19.5" width="22" height="10" rx="4" fill="#1a1f4d" />
      {/* Eyes — blink via scaleY keyframes */}
      <g
        style={{
          transformOrigin: "17px 24.5px",
          animation: "brave-avatar-blink 4.2s ease-in-out infinite",
        }}
      >
        <circle cx="17" cy="24.5" r="2.2" fill="#7de4ff" />
      </g>
      <g
        style={{
          transformOrigin: "27px 24.5px",
          animation: "brave-avatar-blink 4.2s ease-in-out infinite",
        }}
      >
        <circle cx="27" cy="24.5" r="2.2" fill="#7de4ff" />
      </g>
      {/* Tiny smile between the eyes for personality */}
      <path
        d="M21 26 Q22 27.2 23 26"
        stroke="#7de4ff"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Neck + body hint */}
      <rect x="20" y="35" width="4" height="3" fill="#ffffff" />
      <path
        d="M11 39 Q22 36 33 39 L33 40 Q22 37 11 40 Z"
        fill="#ffffff"
      />

      {/* "Hi!" speech bubble */}
      <path
        d="M37 8 H50 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 H44 l-3 3 v-3 h-4 a3 3 0 0 1 -3 -3 v-6 a3 3 0 0 1 3 -3 Z"
        fill="#7de4ff"
      />
      <text
        x="43.5"
        y="17"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        fontSize="7"
        fontWeight="800"
        fill="#1a1f4d"
      >
        Hi!
      </text>
    </svg>
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
                className="cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95"
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
