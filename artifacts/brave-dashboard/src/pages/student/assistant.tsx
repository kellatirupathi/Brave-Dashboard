import { Chatbot } from "@/components/chatbot";

/**
 * Mobile-only assistant destination.
 *
 * The launcher routes here below lg. The shared layout keeps the app header,
 * but intentionally removes the bottom navigation and floating launcher so
 * the assistant owns the remaining viewport.
 */
export default function StudentAssistant() {
  return (
    <div
      className="min-h-[32rem] w-full"
      style={{
        height:
          "calc(100dvh - 3.5rem - var(--safe-area-inset-top, 0px))",
      }}
    >
      <Chatbot fullPage />
    </div>
  );
}