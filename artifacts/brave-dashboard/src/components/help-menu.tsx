import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  HelpCircle,
  BookOpen,
  LifeBuoy,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FeedbackDialog } from "@/components/feedback-dialog";

const STUDENT_DOCS_URL =
  "https://docs.google.com/document/d/1bMULTjBT_yxsoK-hOU2aw2ezGIw66riidnKF0cbSPbY/edit?tab=t.0";
const ADMIN_DOCS_URL =
  "https://docs.google.com/document/d/1qMP-1s3k4GD-cuiYGfjBbcfdQU20___Bl6YLrzgYFb4/edit?usp=sharing";
const COORDINATOR_DOCS_URL =
  "https://docs.google.com/document/d/1_6c8HjUksm8-Qw7eo_fNehJJMeA61mywKMKxKTiYGos/edit?usp=sharing";
const SUPPORT_EMAIL = "brave.niat@nxtwave.in";

const STUDENT_ROTATING_HINTS = [
  "📖 Need help? Check the docs",
  "🛟 Got a question? Contact support",
  "💬 Share your feedback with us",
  "✨ Suggest improvements",
];
// Admin / coordinator don't need a "contact support" hint — they ARE the
// support team. Show only docs + feedback prompts.
const STAFF_ROTATING_HINTS = [
  "📖 Need help? Read the docs",
  "💬 Share your feedback",
  "✨ Suggest improvements",
];
const HINT_INTERVAL_MS = 5000;

function buildSupportMailto(opts: {
  niatId?: string | null;
  name: string;
  email: string;
}) {
  const subject = "Support Request — BRAVE Dashboard";
  const body = [
    "Hi BRAVE Support Team,",
    "",
    "I need help with the following:",
    "",
    "[Describe your issue here]",
    "",
    "—",
    `Name: ${opts.name}`,
    `Email: ${opts.email}`,
    opts.niatId ? `NIAT ID: ${opts.niatId}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export function HelpMenu({ inline = false }: { inline?: boolean } = {}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [hintHovered, setHintHovered] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show the help menu for students, admins, and coordinators. Hide for
  // unauthenticated users (rendered nowhere) or any future role we add
  // without thinking about it.
  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin";
  const isCoordinator = user?.role === "coordinator";
  const isStaff = isAdmin || isCoordinator;
  const enabled = isStudent || isStaff;

  // Pick the docs URL by role so each audience lands on the right guide.
  const docsUrl = isAdmin
    ? ADMIN_DOCS_URL
    : isCoordinator
      ? COORDINATOR_DOCS_URL
      : STUDENT_DOCS_URL;

  // Pick the appropriate rotating-hint set based on role.
  const hints = isStaff ? STAFF_ROTATING_HINTS : STUDENT_ROTATING_HINTS;

  // Rotate hints every HINT_INTERVAL_MS, with a brief fade-out/in transition.
  // Pauses when the popover is open or the user is hovering the hint pill.
  // Skipped entirely for the inline header variant (no hint pill there).
  useEffect(() => {
    if (inline || !enabled || open || hintHovered) return;
    const tick = setInterval(() => {
      setHintVisible(false);
      fadeTimer.current = setTimeout(() => {
        setHintIndex((i) => (i + 1) % hints.length);
        setHintVisible(true);
      }, 300);
    }, HINT_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [enabled, open, hintHovered, hints.length]);

  if (!user || !enabled) return null;

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
    user.email ||
    "Student";
  const supportHref = buildSupportMailto({
    niatId: user.niatId,
    name: fullName,
    email: user.email ?? "",
  });

  const items = [
    {
      icon: BookOpen,
      label: "Documentation",
      caption: "Guide & FAQs",
      onClick: () => {
        window.open(docsUrl, "_blank", "noopener,noreferrer");
        setOpen(false);
      },
    },
    // Support email link — students only. Admin and coordinator are NIAT
    // staff themselves; they don't need to email brave.niat@nxtwave.in.
    ...(isStudent
      ? [
          {
            icon: LifeBuoy,
            label: "Support",
            caption: SUPPORT_EMAIL,
            onClick: () => {
              window.location.href = supportHref;
              setOpen(false);
            },
          },
        ]
      : []),
    {
      icon: MessageSquare,
      label: "Feedback",
      caption: "Rate & share suggestions",
      onClick: () => {
        setOpen(false);
        setFeedbackOpen(true);
      },
    },
  ];

  // Inline variant: compact icon-only button matching the notifications bell.
  // Used in dashboard top bars (next to the bell). No floating positioning,
  // no rotating hint pill.
  const triggerClassName = inline
    ? "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
    : "fixed bottom-6 right-24 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const triggerIconClassName = inline
    ? "h-5 w-5 transition-transform"
    : "h-6 w-6 transition-transform";

  return (
    <>
      {/* Rotating hint pill — sits to the LEFT of the floating help button.
          Hidden when the menu is open, on small screens, while hovered (pauses
          rotation), or in inline mode (the dashboard top-bar doesn't need a hint pill). */}
      {!inline && !open && (
        <div
          className="hidden md:flex fixed bottom-6 right-[10rem] z-50 items-center pointer-events-auto"
          onMouseEnter={() => setHintHovered(true)}
          onMouseLeave={() => setHintHovered(false)}
          aria-hidden="true"
          data-testid="help-hint"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`max-w-xs whitespace-nowrap rounded-full border border-primary/20 bg-background px-3.5 py-2 text-xs font-medium text-foreground shadow-md transition-all duration-300 hover:bg-accent hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              hintVisible
                ? "opacity-100 translate-x-0"
                : "opacity-0 translate-x-2"
            }`}
          >
            {hints[hintIndex % hints.length]}
          </button>
          {/* Small triangle pointer toward the help button */}
          <span
            className={`ml-[-1px] h-0 w-0 border-y-[6px] border-l-[6px] border-y-transparent border-l-background transition-opacity duration-300 ${
              hintVisible ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={open ? "Close help menu" : "Open help menu"}
            title={open ? "Close" : "Help"}
            data-testid="button-help-menu"
            className={triggerClassName}
          >
            {open ? (
              <ChevronDown className={triggerIconClassName} />
            ) : (
              <HelpCircle className={triggerIconClassName} />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side={inline ? "bottom" : "top"}
          align="end"
          sideOffset={inline ? 8 : 12}
          className="w-64 p-2"
          data-testid="menu-help"
        >
          <div className="px-2 py-1.5">
            <p className="text-sm font-semibold">Need a hand?</p>
            <p className="text-xs text-muted-foreground">
              Choose how we can help
            </p>
          </div>
          <div className="h-px bg-border my-1" />
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.label}
                onClick={item.onClick}
                data-testid={`help-item-${item.label.toLowerCase()}`}
                className="w-full flex items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.caption}
                  </p>
                </div>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
