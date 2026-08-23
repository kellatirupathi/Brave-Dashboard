// Install + update prompts for the installable app (additive, isolated).
//
// Two separate concerns, deliberately in one file because they share the same
// bottom-sheet treatment and the same "never interrupt" posture:
//
//   1. InstallPrompt — invites a student to add BRAVE to their home screen.
//   2. UpdatePrompt  — offers a reload when a new version has been deployed.
//
// POSTURE
// - Never blocking. Both are dismissible bottom sheets, never modal overlays.
//   A student mid-way through logging a client visit must not be interrupted.
// - Dismissal is remembered. Nagging on every page load is how an install
//   prompt trains people to ignore it.
// - Hidden entirely when already running as an installed app, and for anyone
//   who is not a student — coordinators and admins work at a desk.
//
// Deleting this file means removing the two tags from App.tsx.
import { useEffect, useState } from "react";
import { Download, RefreshCw, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";

// ── Environment checks ──────────────────────────────────────────────────────

/** True when the page is already running as an installed app. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari predates the standard and uses its own flag.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch check separates it from a desktop.
    (/Mac/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/** Running inside the Capacitor native shell — never prompt to install there. */
function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

const DISMISS_KEY = "brave.installPrompt.dismissedAt";
/** How long a dismissal is respected before the invitation returns. */
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 86_400_000;
  } catch {
    // Private mode / storage blocked — treat as not dismissed rather than
    // suppressing the prompt entirely.
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable; the prompt simply returns next load */
  }
}

// ── Shared shell ────────────────────────────────────────────────────────────

/**
 * Bottom sheet on phones, floating card bottom-right on tablet and desktop.
 * Sits above the mobile bottom nav via a safe-area-aware offset.
 */
function Sheet({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed z-50 left-0 right-0 bottom-0 p-3",
        "sm:left-auto sm:right-4 sm:bottom-4 sm:p-0 sm:max-w-sm",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
        className,
      )}
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
      }}
      role="dialog"
      aria-live="polite"
    >
      <div className="rounded-xl border bg-card text-card-foreground shadow-lg p-4">
        {children}
      </div>
    </div>
  );
}

// ── Install ─────────────────────────────────────────────────────────────────

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || isNativeShell() || recentlyDismissed()) return;

    // Android/Chrome: the browser hands us the event and we choose when to use
    // it. Capturing it also suppresses Chrome's own mini-infobar, so the
    // invitation appears in our styling rather than the browser's.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, so Safari gets a short "how to" instead —
    // shown after a delay so it never lands during first paint.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      timer = setTimeout(() => setShowIosHelp(true), 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Students are the ones working in the field; staff use a desktop.
  if (!user || user.role !== "student") return null;
  if (dismissed) return null;
  if (!deferred && !showIosHelp) return null;

  const close = () => {
    markDismissed();
    setDismissed(true);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Either way the event is single-use, so clear it and stop asking.
    setDeferred(null);
    close();
  };

  return (
    <Sheet>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Download className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Add BRAVE to your home screen</p>
          {deferred ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Open it like an app, and capture leads even without signal.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Tap{" "}
              <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" />{" "}
              below, then <span className="font-medium">Add to Home Screen</span>{" "}
              <Plus className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />
            </p>
          )}
          {deferred && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={install} data-testid="button-pwa-install">
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Not now
              </Button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </Sheet>
  );
}

// ── Update ──────────────────────────────────────────────────────────────────

export function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateFn, setUpdateFn] = useState<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Dynamic import: the virtual module only exists once the PWA plugin has
    // run, so a dev server without it must not fail to boot.
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;
        const update = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true);
          },
        });
        // Stored in a closure — passing the function directly to setState
        // would have React call it as an updater.
        setUpdateFn(() => () => update(true));
      })
      .catch(() => {
        /* no service worker in this build; nothing to offer */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <Sheet>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">A new version is ready</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reload to get the latest. Anything you have typed is kept.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => updateFn?.()}
              data-testid="button-pwa-update"
            >
              Reload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setNeedRefresh(false)}
            >
              Later
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
