import { LifeBuoy, Mail } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";

const SUPPORT_EMAIL = "brave.niat@nxtwave.in";

// Build a Gmail web "compose" URL so the button opens Gmail directly (in a new
// tab) with the recipient, subject, and a pre-filled body. Gmail uses `su` for
// the subject; `view=cm&fs=1` opens a full-screen compose window.
function buildSupportGmailUrl(opts: {
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
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    SUPPORT_EMAIL,
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SupportBanner() {
  const { user } = useAuth();

  const fullName =
    `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
    user?.email ||
    "Student";
  const supportHref = buildSupportGmailUrl({
    niatId: user?.niatId,
    name: fullName,
    email: user?.email ?? "",
  });

  return (
    <div
      className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 sm:px-6 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      data-testid="banner-support"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Need help or have a question?
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Email us at{" "}
            <a
              href={supportHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline"
              data-testid="banner-support-email-link"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            — we reply within 24 hours.
          </p>
        </div>
      </div>
      <a
        href={supportHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background self-stretch sm:self-auto justify-center sm:justify-start whitespace-nowrap"
        data-testid="banner-support-button"
      >
        <Mail className="w-4 h-4" />
        Email Support
      </a>
    </div>
  );
}
