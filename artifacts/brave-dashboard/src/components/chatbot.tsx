import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bot, X, Send, Trash2 } from "lucide-react";
import chatbotIconUrl from "@/assets/chatbot-icon.png";

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

const LAUNCHER_DISMISSED_KEY = "brave-chatbot-launcher-dismissed";

function launcherWasDismissed(): boolean {
  try {
    return sessionStorage.getItem(LAUNCHER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissLauncherForSession(): void {
  try {
    sessionStorage.setItem(LAUNCHER_DISMISSED_KEY, "1");
  } catch {
    // The in-component state below still hides it for this mounted session.
  }
}

export function Chatbot({
  variant = "light",
  fullPage = false,
}: {
  variant?: "light" | "dark";
  fullPage?: boolean;
}) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(launcherWasDismissed);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  // Staggered intro animation. 0 = "one sec..." typing, 1 = greeting visible,
  // 2/3/4 = greeting + N suggestions revealed. Replays whenever the chat is
  // opened while the conversation is still in its initial state.
  const [introStep, setIntroStep] = useState(0);
  const isInitialConversation =
    messages.length === 1 &&
    messages[0]?.role === "assistant" &&
    messages[0]?.content === DEFAULT_GREETING;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const chatVisible = open || fullPage;
  const isAssistantRoute = location.startsWith("/assistant");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending, chatVisible]);

  useEffect(() => {
    if (!chatVisible) return undefined;
    // Tiny delay so the panel is mounted before focusing.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [chatVisible]);

  // Replay the intro animation each time the chat is opened while still on
  // the default greeting. 1s for the greeting bubble to appear, then the
  // three default suggestions stagger in over the next ~2s.
  useEffect(() => {
    if (!chatVisible) return undefined;
    if (fullPage) {
      setIntroStep(4);
      return undefined;
    }
    if (!isInitialConversation) {
      setIntroStep(4);
      return undefined;
    }
    setIntroStep(0);
    const timers = [
      setTimeout(() => setIntroStep(1), 1000),
      setTimeout(() => setIntroStep(2), 1666),
      setTimeout(() => setIntroStep(3), 2333),
      setTimeout(() => setIntroStep(4), 3000),
    ];
    return () => timers.forEach(clearTimeout);
    // We intentionally only re-run when `open` flips — replaying the intro
    // on every messages change would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatVisible, fullPage]);

  // Close the chat when the user clicks anywhere outside it (but ignore the
  // click that opened it — the launcher itself is outside the panel).
  useEffect(() => {
    if (!chatVisible || fullPage) return undefined;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (launcherRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [chatVisible, fullPage]);

  // Close on Escape too — small quality-of-life win.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The global assistant is suppressed while the dedicated mobile route owns
  // the screen. The route renders its own full-page instance below. This
  // happens after all hooks so route changes never change hook order.
  if (location === "/assistant" && !fullPage) return null;

  const clearConversation = () => {
    setMessages(initialMessages());
    setInput("");
    setSending(false);
    // Replay the staggered intro animation after clearing.
    setIntroStep(0);
    const timers = [
      setTimeout(() => setIntroStep(1), 1000),
      setTimeout(() => setIntroStep(2), 1666),
      setTimeout(() => setIntroStep(3), 2333),
      setTimeout(() => setIntroStep(4), 3000),
    ];
    // Re-focus the input so the user can immediately type again.
    const focusT = setTimeout(() => inputRef.current?.focus(), 50);
    // Best-effort cleanup if the component unmounts mid-animation.
    void timers;
    void focusT;
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
          (m, i) =>
            !(
              i === 0 &&
              m.role === "assistant" &&
              m.content === DEFAULT_GREETING
            ),
        )
        .map((m) => ({ role: m.role, content: m.content }))
        // Only the last few turns matter for context; sending the whole
        // transcript bloats the request and used to trip the server's
        // history-length validation. The server uses the last 10 anyway.
        .slice(-12);

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
  const handleLauncherClick = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setLocation("/assistant");
    } else {
      setOpen(true);
    }
  };
  const handleClose = () => {
    if (fullPage) {
      dismissLauncherForSession();
      setDismissed(true);
      setLocation("/");
    } else {
      setOpen(false);
    }
  };

  return (
    <>
      {/* Floating launcher — visible only when the chat is closed AND the
          user hasn't hidden it for this page load. */}
      {!fullPage && !isAssistantRoute && !open && !dismissed && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            ref={launcherRef}
            type="button"
            onClick={handleLauncherClick}
            aria-label="Open BRAVE assistant"
            data-testid="button-open-chatbot"
            className="relative block cursor-pointer group focus:outline-none"
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
                boxShadow: "0 0 0 0 rgba(125,228,255,0.55)",
                animation:
                  "brave-chatbot-ping 2.4s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
            <span
              className="relative block h-16 w-16 transition-transform group-hover:scale-110 group-active:scale-95"
              style={{
                filter: "drop-shadow(0 12px 24px rgba(26,31,77,0.5))",
              }}
            >
              <img
                src={chatbotIconUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-full w-full select-none object-contain"
              />
            </span>
          </button>

          {/* ✕ — hide the launcher for this page load. Reappears only on a
              full page reload (see `launcherDismissed`). stopPropagation keeps
              the click off the launcher / outside-click handlers. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissLauncherForSession();
              setDismissed(true);
            }}
            aria-label="Hide assistant"
            title="Hide assistant"
            data-testid="button-dismiss-chatbot"
            className={`absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center transition-transform hover:scale-110 focus:outline-none ${
              isDark
                ? "text-white/90 hover:text-white"
                : "text-gray-700 hover:text-black"
            }`}
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }}
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Chat panel. */}
      {chatVisible && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="BRAVE assistant"
          data-testid="chatbot-panel"
          className={
            fullPage
              ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
              : "fixed bottom-6 right-6 z-50 flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          }
          style={{
            height: fullPage ? undefined : "min(78vh, 580px)",
            background: isDark ? "#1a0a08" : "#ffffff",
            borderColor: isDark
              ? "rgba(247,172,43,0.25)"
              : "rgba(212,64,47,0.18)",
            color: isDark ? "#fff3df" : "#111",
            transformOrigin: fullPage ? undefined : "bottom right",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-3"
            style={{
              background: "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
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
              onClick={handleClose}
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
            {isInitialConversation && introStep === 0 ? (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm"
                  style={{
                    background: isDark
                      ? "rgba(247,172,43,0.12)"
                      : "rgba(212,64,47,0.06)",
                    color: isDark ? "#fff3df" : "#111",
                  }}
                  data-testid="chatbot-intro-typing"
                >
                  <span className="inline-flex items-center gap-1">
                    <Dot />
                    <Dot delay="120ms" />
                    <Dot delay="240ms" />
                    <span className="ml-2 text-xs opacity-70">one sec…</span>
                  </span>
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                const isGreeting =
                  isInitialConversation &&
                  i === 0 &&
                  m.role === "assistant" &&
                  m.content === DEFAULT_GREETING;
                return (
                  <MessageRow
                    key={i}
                    msg={m}
                    isDark={isDark}
                    onPickSuggestion={(q) => send(q)}
                    disabled={sending}
                    isLast={i === messages.length - 1}
                    visibleSuggestions={
                      isGreeting ? Math.max(0, introStep - 1) : undefined
                    }
                    animateBubble={isGreeting}
                  />
                );
              })
            )}
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
                background: "linear-gradient(135deg, #d4402f 0%, #f7ac2b 100%)",
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
        @keyframes brave-chatbot-fadein {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
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
        <line
          x1="16"
          y1="3"
          x2="16"
          y2="7"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
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

function MessageRow({
  msg,
  isDark,
  onPickSuggestion,
  disabled,
  isLast,
  visibleSuggestions,
  animateBubble = false,
}: {
  msg: ChatMessage;
  isDark: boolean;
  onPickSuggestion: (q: string) => void;
  disabled: boolean;
  isLast: boolean;
  visibleSuggestions?: number;
  animateBubble?: boolean;
}) {
  const isUser = msg.role === "user";
  const suggestionsToShow =
    msg.suggestions == null
      ? []
      : visibleSuggestions == null
        ? msg.suggestions
        : msg.suggestions.slice(0, visibleSuggestions);
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      style={
        animateBubble
          ? { animation: "brave-chatbot-fadein 0.35s ease-out both" }
          : undefined
      }
    >
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
        {!isUser && isLast && suggestionsToShow.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestionsToShow.map((s, i) => (
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
                  animation:
                    visibleSuggestions != null
                      ? "brave-chatbot-fadein 0.35s ease-out both"
                      : undefined,
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
