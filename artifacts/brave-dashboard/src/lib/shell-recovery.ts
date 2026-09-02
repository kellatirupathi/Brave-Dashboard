// Recovery from a broken app shell (additive, isolated).
//
// THE FAILURE THIS EXISTS FOR
// index.html references a content-hashed bundle: /assets/index-<hash>.js. A
// deploy publishes a new hash and DELETES the old file. The service worker
// precaches index.html, so on the next launch a stale cached shell can ask the
// server for a bundle that no longer exists. The script 404s, React never
// mounts, and the student is left looking at a white screen.
//
// In a browser that is annoying: a hard refresh fixes it. In the installed app
// it is unrecoverable — there is no address bar, no refresh button, and no way
// for a student in the field to clear a service worker. The app is simply
// dead until it is reinstalled.
//
// So a failed shell load is treated as what it is: a cache that no longer
// matches the server. Drop every cache, unregister the worker, reload once.
//
// WHY ONCE
// If the deploy itself is broken, reloading will not help, and a loop would be
// worse than the white screen — it would burn battery and data while showing
// the same nothing. The sessionStorage flag caps it at a single attempt per
// launch, and is cleared once a render actually succeeds so a later failure in
// a long session can still recover.
//
// Deleting this file means removing its two calls in main.tsx.

const RECOVERY_KEY = "brave:shell-recovery-attempted";

/** True when this launch has already tried to recover. */
function alreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. Treat as attempted: without a way to
    // remember, retrying could loop forever.
    return true;
  }
}

function markAttempted(): void {
  try {
    sessionStorage.setItem(RECOVERY_KEY, "1");
  } catch {
    /* nothing to do; alreadyAttempted() already refuses to retry */
  }
}

/**
 * Clear every cache and service worker, then reload.
 *
 * Best-effort throughout: a failure to clear one cache must not stop the
 * reload, because the reload is the part that might fix it.
 */
async function purgeAndReload(): Promise<void> {
  if (alreadyAttempted()) return;
  markAttempted();

  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }

  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs ?? []).map((r) => r.unregister()));
  } catch {
    /* best effort */
  }

  window.location.reload();
}

/**
 * Watch for the app shell failing to load.
 *
 * Listens in the CAPTURE phase because resource errors (a <script> or <link>
 * that 404s) fire on the element and do not bubble — a listener on window in
 * the normal phase never sees them.
 *
 * Call before rendering.
 */
export function watchForBrokenShell(): void {
  if (typeof window === "undefined") return;

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      // Only the shell's own assets. An <img> that fails is a broken image,
      // not a broken app, and must not trigger a reload.
      if (tag === "SCRIPT" || tag === "LINK") {
        void purgeAndReload();
      }
    },
    true,
  );

  // A lazily-imported route chunk that has been deleted by a deploy rejects
  // rather than firing a resource error, and surfaces here.
  window.addEventListener("unhandledrejection", (event) => {
    const message = String(
      (event.reason as { message?: unknown } | null)?.message ?? event.reason,
    );
    if (
      /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
        message,
      )
    ) {
      void purgeAndReload();
    }
  });
}

/**
 * Mark this launch as healthy.
 *
 * Called a few seconds after the first render: getting that far means the
 * shell and its bundle agree, so the one-attempt lock is released and a much
 * later failure in the same session can still recover.
 */
export function clearRecoveryLock(): void {
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      /* nothing stored, nothing to clear */
    }
  }, 5000);
}
