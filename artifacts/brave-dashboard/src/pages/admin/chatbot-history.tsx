import { useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Bot, MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  listChatbotHistory,
  getChatbotHistoryForUser,
} from "@/lib/chatbot-history-api";

function roleBadgeClass(role: string | null): string {
  switch (role) {
    case "admin":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "coordinator":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "student":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ─── List: one row per student who has chatted ──────────────────────────────
function ListView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["chatbot-history-list"],
    queryFn: listChatbotHistory,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Failed to load chatbot history.
      </Card>
    );
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground italic">
        No chatbot conversations recorded yet.
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 font-medium">Student</th>
              <th className="p-3 font-medium">NIAT ID</th>
              <th className="p-3 font-medium">Campus</th>
              <th className="p-3 font-medium">Role</th>
              <th className="p-3 font-medium text-right">Questions</th>
              <th className="p-3 font-medium">Last chatted</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.userId}
                className="border-t hover:bg-muted/30"
                data-testid={`row-chat-${it.userId}`}
              >
                <td className="p-3">
                  <Link
                    href={`/admin/chatbot-history?userId=${encodeURIComponent(it.userId)}`}
                    className="block font-medium hover:underline"
                  >
                    {it.name}
                  </Link>
                  {it.email ? (
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {it.email}
                    </div>
                  ) : null}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {it.niatId || "—"}
                </td>
                <td className="p-3 text-muted-foreground">
                  {it.campusName || "—"}
                </td>
                <td className="p-3">
                  <Badge variant="outline" className={roleBadgeClass(it.role)}>
                    {it.role ?? "—"}
                  </Badge>
                </td>
                <td className="p-3 text-right tabular-nums font-semibold">
                  {it.questions}
                </td>
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {it.lastChattedAt ? formatDateTime(it.lastChattedAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Detail: one student's full conversation thread ─────────────────────────
function DetailView({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["chatbot-history", userId],
    queryFn: () => getChatbotHistoryForUser(userId),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Failed to load this conversation.
      </Card>
    );
  }

  const { user, messages } = data;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <div className="text-sm text-muted-foreground">
              {user.campusName ?? "—"}
              {user.niatId ? ` · NIAT ID: ${user.niatId}` : ""}
              {user.email ? ` · ${user.email}` : ""}
            </div>
          </div>
          <Badge variant="outline" className={roleBadgeClass(user.role)}>
            {user.role ?? "—"}
          </Badge>
        </div>
      </Card>

      <Card className="p-5">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">
            No messages recorded for this user.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-[75%]">
                    <div
                      className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      {m.message}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1 text-[11px] text-muted-foreground ${
                        isUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      {isUser ? (
                        <>
                          <span>Student</span>
                          <span>·</span>
                        </>
                      ) : (
                        <>
                          <Bot className="h-3 w-3" />
                          <span>Assistant</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="tabular-nums">
                        {formatDateTime(m.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ChatbotHistoryPage() {
  const search = useSearch();
  const userId = new URLSearchParams(search).get("userId");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {userId ? (
          <Link
            href="/admin/chatbot-history"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back-to-chatbot-list"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to all conversations
          </Link>
        ) : (
          <span />
        )}
        {userId ? (
          <Link href="/admin/chatbot-history">
            <Button variant="outline" size="sm">
              View all
            </Button>
          </Link>
        ) : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Chatbot History
        </h1>
        <p className="text-sm text-muted-foreground">
          {userId
            ? "Full conversation for this student, oldest first."
            : "Every student who has chatted with the BRAVE assistant. Click a row to read their conversation."}
        </p>
      </div>

      {userId ? <DetailView userId={userId} /> : <ListView />}
    </div>
  );
}
