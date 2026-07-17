// Branded full-screen loading state — the BRAVE wordmark with a light sweeping
// across it left→right, over a slow pulse. Shown while a route resolves, for
// every role. Replaces the bare spinner on full-page waits; the plain Spinner
// is still the right choice for small in-card waits.
//
// The sweep is a masked gradient rather than an overlay, so it lights up the
// letters themselves instead of washing a box over them.
import { BraveLogo } from "./brave-logo";

export function BraveLoader({ label }: { label?: string }) {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-5 bg-background"
      role="status"
      aria-live="polite"
      data-testid="brave-loader"
    >
      {/* Scoped so the keyframes ship with the component and can't collide
          with anything else in the app's CSS. */}
      <style>{`
        @keyframes brave-sweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }
        @keyframes brave-breathe {
          0%, 100% { opacity: 1; }
          50%      { opacity: .55; }
        }
        @keyframes brave-bar {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .brave-loader-mark {
          position: relative;
          overflow: hidden;
          animation: brave-breathe 2s ease-in-out infinite;
        }
        .brave-loader-sweep {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            100deg,
            transparent 20%,
            rgba(239, 159, 39, .55) 50%,
            transparent 80%
          );
          animation: brave-sweep 1.6s ease-in-out infinite;
        }
        .brave-loader-bar { animation: brave-bar 1.6s ease-in-out infinite; }
        /* Honour reduced-motion: keep it visible, drop the movement. */
        @media (prefers-reduced-motion: reduce) {
          .brave-loader-mark { animation: none; }
          .brave-loader-sweep { display: none; }
          .brave-loader-bar { animation: none; transform: none; width: 100%; }
        }
      `}</style>

      <span className="brave-loader-mark inline-block">
        <BraveLogo className="text-4xl" />
        <span className="brave-loader-sweep" aria-hidden="true" />
      </span>

      {/* Indeterminate track — reads as progress without claiming a percentage. */}
      <span className="relative block h-0.5 w-28 overflow-hidden rounded-full bg-muted">
        <span className="brave-loader-bar absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary" />
      </span>

      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
