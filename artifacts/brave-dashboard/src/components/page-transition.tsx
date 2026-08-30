// Page transitions for the native shell (additive, isolated).
//
// A website swaps content instantly; an app moves it. That difference is most
// of what "feels native" actually means — more than the rendering engine.
//
// Android's convention: a new screen enters from the right and the old one
// leaves left, and going BACK reverses it. Getting the direction wrong is
// worse than no animation, because it implies the wrong spatial model.
//
// IMPLEMENTATION NOTES
// - CSS animation, not a spring library: no bundle cost, and the compositor
//   runs it off the main thread so it stays smooth while React re-renders.
// - Depth is tracked by path segment count, which is how these routes actually
//   nest (/leads -> /leads/12 -> /leads/12/project). No history API needed.
// - Respects prefers-reduced-motion via the CSS itself.
// - Native only. The web keeps instant navigation, which is correct there.
//
// Deleting this file means removing its one wrapper in App.tsx.
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { isNativeApp } from "@/lib/native-auth";

/** How deep a path sits, so we can tell forward from back. */
function depthOf(path: string): number {
  return path.split("/").filter(Boolean).length;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const native = isNativeApp();
  const prevDepth = useRef(depthOf(location));
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // Keyed on location so React remounts the subtree and the animation replays.
  const [key, setKey] = useState(location);

  useEffect(() => {
    if (!native) return;
    const next = depthOf(location);
    // Same depth (a sibling tab) animates forward — there is no "back" between
    // two bottom-bar destinations, and reversing there would read as an undo.
    setDirection(next < prevDepth.current ? "back" : "forward");
    prevDepth.current = next;
    setKey(location);
  }, [location, native]);

  if (!native) return <>{children}</>;

  return (
    <div
      key={key}
      data-testid="page-transition"
      className={
        direction === "back" ? "page-enter-back" : "page-enter-forward"
      }
    >
      {children}
    </div>
  );
}
