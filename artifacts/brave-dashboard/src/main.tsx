import { createRoot } from "react-dom/client";
import { isNativeApp } from "./lib/native-auth";
import { initNativeShell } from "./lib/native-shell";
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
  createRoot(document.getElementById("root")!).render(<App />);
}
