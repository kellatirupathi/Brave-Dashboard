import { useMemo, useState } from "react";
import { useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bot, MessageSquare, Search, Download } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import {
  listChatbotHistory,
  getChatbotHistoryForUser,
  exportChatbotHistory,
  type ChatbotHistoryExportItem,
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

function messageDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatMessageDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const today = new Date();
  const todayKey = messageDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateKey = messageDateKey(date);

  if (dateKey === todayKey) return "Today";
  if (dateKey === messageDateKey(yesterday)) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMessageTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// RFC-4180 cell escaping: wrap in quotes, double any inner quotes. Also guards
// against CSV formula injection — chat messages are user-controlled free text,
// so a leading =, +, -, @, tab or CR could execute as a formula when an admin
// opens the file in a spreadsheet. Prefix those with a single quote to neutralise.
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

// Builds one CSV with the table columns repeated per message row, so each row
// carries both the user's directory info and a single chat message. Users with
// no messages still get one row so they aren't lost from the export.
function buildExportCsv(items: ChatbotHistoryExportItem[]): string {
  const header = [
    "User",
    "Email",
    "NIAT ID",
    "Campus",
    "Role",
    "Questions",
    "Total messages",
    "Last chatted",
    "Message #",
    "Sender",
    "Message",
    "Message time",
  ];
  const lines = [header.map(csvCell).join(",")];

  for (const it of items) {
    const base = [
      it.name,
      it.email ?? "",
      it.niatId ?? "",
      it.campusName ?? "",
      it.role ?? "",
      it.questions,
      it.totalMessages,
      it.lastChattedAt ? formatDateTime(it.lastChattedAt) : "",
    ];
    if (it.messages.length === 0) {
      lines.push([...base, "", "", "", ""].map(csvCell).join(","));
      continue;
    }
    it.messages.forEach((m, idx) => {
      lines.push(
        [
          ...base,
          idx + 1,
          m.role === "user" ? "Student" : "Assistant",
          m.message,
          formatDateTime(m.createdAt),
        ]
          .map(csvCell)
          .join(","),
      );
    });
  }

  return lines.join("\n");
}

// ─── List: one row per student who has chatted ──────────────────────────────
function ListView() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["chatbot-history-list"],
    queryFn: listChatbotHistory,
  });

  const allItems = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) =>
      [it.name, it.email, it.niatId, it.campusName, it.role]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [allItems, query]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportChatbotHistory();
      const csv = buildExportCsv(res.items);
      downloadCsv(
        `chatbot-history-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
      );
    } catch {
      toast({
        title: "Export failed",
        description: "Could not download chatbot history. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, NIAT ID, campus, email…"
          className="pl-8"
          data-testid="input-chatbot-search"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={exporting || allItems.length === 0}
        data-testid="button-export-chatbot-history"
      >
        {exporting ? (
          <Spinner className="mr-2 size-4" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        Export
      </Button>
    </div>
  );

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
  if (allItems.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground italic">
        No chatbot conversations recorded yet.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      {filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground italic">
          No conversations match “{query}”.
        </Card>
      ) : (
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
            {filtered.map((it) => (
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
      )}
    </div>
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
  const chronologicalMessages = useMemo(
    () =>
      messages
        .map((message, index) => ({ message, index }))
        .sort((a, b) => {
          const timeDifference =
            new Date(a.message.createdAt).getTime() -
            new Date(b.message.createdAt).getTime();
          return timeDifference || a.index - b.index;
        })
        .map(({ message }) => message),
    [messages],
  );
  let previousDateKey: string | null = null;

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
            {chronologicalMessages.map((m) => {
              const isUser = m.role === "user";
              const dateKey = messageDateKey(m.createdAt);
              const showDateSeparator = dateKey !== previousDateKey;
              previousDateKey = dateKey;
              return (
                <div key={m.id} className="space-y-3">
                  {showDateSeparator && (
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                        {formatMessageDate(m.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
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
                          {formatMessageTime(m.createdAt)}
                        </span>
                      </div>
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
