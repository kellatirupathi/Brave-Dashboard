import { Chatbot } from "@/components/chatbot";

/**
 * Mobile-only assistant destination.
 *
 * The launcher routes here below lg so the assistant gets the same fixed
 * header and bottom navigation as the rest of the installed app, instead of
 * competing with the page content as a floating panel.
 */
export default function StudentAssistant() {
  return (
    <div className="-mx-4 -mt-4 -mb-20 h-[calc(100dvh-8.5rem)] min-h-[32rem] sm:-mx-6 sm:-mt-6 sm:-mb-20">
      <Chatbot fullPage />
    </div>
  );
}