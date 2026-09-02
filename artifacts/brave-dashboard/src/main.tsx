import { createRoot } from "react-dom/client";
import { isNativeApp } from "./lib/native-auth";
import { initNativeShell } from "./lib/native-shell";
import { watchForBrokenShell, clearRecoveryLock } from "./lib/shell-recovery";
import App from "./App";
import "./index.css";

const CANONICAL_HOST = "dashboard.brave.niatindia.com";

if (
  typeof window !== "undefined" &&
  /\.replit\.(app|dev)$/i.test(window.location.host) &&
  window.location.host !== CANONICAL_HOST
) {
  const target =
    `https://${CANONICAL_HOST}` +
    window.location.pathname +
    window.location.search +
    window.location.hash;
  window.location.replace(target);
} else {
  // Stamped before first paint so the native-only rules in index.css apply
  // from the very first frame rather than flashing web behaviour first.
  if (isNativeApp()) {
    document.documentElement.classList.add("native-app");
    initNativeShell();
  }
  // Armed BEFORE the first render: the failure it catches is the shell's own
  // bundle not loading, which happens before any React code runs.
  watchForBrokenShell();
  createRoot(document.getElementById("root")!).render(<App />);
  clearRecoveryLock();
}
