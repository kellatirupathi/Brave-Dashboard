import { createRoot } from "react-dom/client";
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
  createRoot(document.getElementById("root")!).render(<App />);
}
