// Offline indicator (additive, isolated).
//
// A student captures leads standing in a client's shop, where signal is often
// poor. Without this, a failed save looks like the app is broken rather than
// like the phone is offline — and the difference matters, because one is worth
// retrying in a minute and the other is worth reporting.
//
// POSTURE
// - A slim bar, not a dialog. It informs; it never blocks.
// - Shows a brief "Back online" confirmation, then disappears on its own. A
//   student who watched the offline bar needs to see it resolve.
// - navigator.onLine is unreliable on its own (it reports "online" for a
//   connected-but-dead network), so the online/offline EVENTS drive this
//   rather than polling the flag.
//
// Deleting this file means removing the one <OfflineBanner /> tag in layout.tsx.
import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long the "Back online" confirmation stays up. */
const RESTORED_MS = 3000;

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [justRestored, setJustRestored] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const goOffline = () => {
      setOffline(true);
      setJustRestored(false);
      if (timer) clearTimeout(timer);
    };
    const goOnline = () => {
      setOffline(false);
      setJustRestored(true);
      timer = setTimeout(() => setJustRestored(false), RESTORED_MS);
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!offline && !justRestored) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="banner-offline"
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium",
        offline
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
      )}
    >
      {offline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            You&rsquo;re offline. You can keep reading — saving will need signal.
          </span>
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Back online.</span>
        </>
      )}
    </div>
  );
}
