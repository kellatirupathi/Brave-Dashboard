// Animated "Follow us on Instagram" link card for the student dashboard's
// right rail. Opens the BRAVE Instagram profile in a new tab. Additive +
// self-contained.
import { Instagram } from "lucide-react";
import { cn } from "@/lib/utils";

export const INSTAGRAM_URL =
  "https://www.instagram.com/brave.niat?igsh=MWVmeHNvb3hmeHJoOQ==";

export function InstagramLink({ className }: { className?: string }) {
  return (
    <a
      href={INSTAGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Follow BRAVE on Instagram (opens in a new tab)"
      data-testid="instagram-link"
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
        <Instagram className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">
          Follow us on Instagram
        </div>
        <div className="truncate text-xs text-muted-foreground">
          @brave.niat
        </div>
      </div>
    </a>
  );
}
