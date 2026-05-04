import { useState } from "react";
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

const DOCS_URL =
  "https://docs.google.com/document/d/1bMULTjBT_yxsoK-hOU2aw2ezGIw66riidnKF0cbSPbY/edit?usp=sharing";
const SUPPORT_EMAIL = "brave.niat@nxtwave.in";

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

export function HelpMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  if (!user || user.role !== "student") return null;

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
        window.open(DOCS_URL, "_blank", "noopener,noreferrer");
        setOpen(false);
      },
    },
    {
      icon: LifeBuoy,
      label: "Support",
      caption: SUPPORT_EMAIL,
      onClick: () => {
        window.location.href = supportHref;
        setOpen(false);
      },
    },
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

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={open ? "Close help menu" : "Open help menu"}
            title={open ? "Close" : "Help"}
            data-testid="button-help-menu"
            className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {open ? (
              <ChevronDown className="h-6 w-6 transition-transform" />
            ) : (
              <HelpCircle className="h-6 w-6 transition-transform" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
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
