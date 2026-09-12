// Pieces of a ticket conversation, shared by the student and staff pages.
//
// Both sides render the same thread — the opening question, then every reply
// and follow-up — so what a student reads and what staff see cannot drift.
import type { ReactNode } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { TicketMessage } from "@/lib/tickets-api";

/** Keeps a long filename readable without losing what kind of file it is. */
export function attachmentName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.length > 28 ? `${name.slice(0, 14)}…${name.slice(-10)}` : name;
}

/** One entry in the conversation: who said it, when, and what. */
export function TicketBubble({
  kind,
  author,
  at,
  edited = false,
  actions,
  children,
}: {
  kind: "student" | "staff";
  author: string;
  at: string;
  edited?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const staff = kind === "staff";
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        staff
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs">
          <span
            className={cn(
              "font-semibold",
              staff ? "text-emerald-800 dark:text-emerald-300" : "text-foreground",
            )}
          >
            {author}
          </span>
          <span className="text-muted-foreground">
            {" · "}
            {formatDateTime(at)}
            {edited ? " · edited" : ""}
          </span>
        </p>
        {actions}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * The words of a message. Staff replies are sanitised HTML — cleaned on the
 * server before they were stored (api-server/src/lib/sanitize-html.ts) — and
 * student text is plain and stays plain.
 */
export function TicketMessageText({
  message,
}: {
  message: Pick<TicketMessage, "authorKind" | "body">;
}) {
  if (message.authorKind === "staff") {
    return (
      <div
        className="break-words text-sm [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: message.body }}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
  );
}

export function TicketAttachments({ paths }: { paths: string[] | null }) {
  if (!paths?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {paths.map((path) => (
        <a
          key={path}
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors hover:bg-muted"
        >
          <Paperclip className="h-3 w-3" aria-hidden="true" />
          {attachmentName(path)}
        </a>
      ))}
    </div>
  );
}
