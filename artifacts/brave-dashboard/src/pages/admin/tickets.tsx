// Ticket Support — the staff queue (additive, isolated).
//
// Three tabs answer three different questions. Active: what still needs
// somebody. Closed: what was answered, and what we said. My tickets:
// everything I hold — both what is still on my plate and what I have already
// closed, because "what did I answer last week" is as real a question as
// "what do I owe".
//
// The queue is compact on purpose — reference, subject, status, who raised it
// and the first line of what they wrote. Assigning, replying, and correcting
// or withdrawing a reply all happen on the ticket page, where the whole
// conversation is in front of you.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LifeBuoy, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketStatusBadge } from "@/components/ticket-status-badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  getTicketQueue,
  ticketKeys,
  ticketRef,
  type Ticket,
  type TicketScope,
} from "@/lib/tickets-api";
import { TICKET_CATEGORY_TREE } from "@/lib/ticket-categories";

const TABS: { key: TicketScope; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
  { key: "mine", label: "My tickets" },
];

function creatorName(t: Ticket): string {
  const name = `${t.creatorFirstName ?? ""} ${t.creatorLastName ?? ""}`.trim();
  return name || t.creatorEmail || "Unknown";
}

export default function AdminTickets() {
  const [scope, setScope] = useState<TicketScope>("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // A one-character search matches almost everything, so the server ignores it;
  // not sending it keeps the cache key stable while someone is still typing.
  const filters = {
    scope,
    search: search.trim().length >= 2 ? search.trim() : "",
    category,
    from,
    to,
  };

  const queueQ = useQuery({
    queryKey: ticketKeys.queue(filters),
    queryFn: () => getTicketQueue(filters),
  });

  const tickets = queueQ.data?.tickets ?? [];
  const counts = queueQ.data?.counts;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <LifeBuoy className="w-5 h-5 text-primary" />
          Ticket Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Questions raised by students in this season.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const count =
            t.key === "active"
              ? counts?.active
              : t.key === "closed"
                ? counts?.closed
                : counts?.mine;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setScope(t.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                scope === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
              {count != null && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, student, NIAT ID…"
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select
          value={category || "all"}
          onValueChange={(v) => setCategory(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-[190px]" data-testid="filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {TICKET_CATEGORY_TREE.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-[150px]"
          aria-label="From date"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[150px]"
          aria-label="To date"
        />
        {(search || category || from || to) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCategory("");
              setFrom("");
              setTo("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {queueQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="p-10 text-center">
          <LifeBuoy className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 font-medium">Nothing here</p>
          <p className="text-sm text-muted-foreground mt-1">
            {scope === "active"
              ? "No open tickets — everything has been answered."
              : scope === "mine"
                ? "You haven't taken any tickets yet."
                : "No closed tickets match these filters."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <TicketRow key={t.publicId} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Two lines: reference, subject and status, then who raised it and the start
 * of what they wrote. Everything else is on the ticket page.
 */
function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <Link
      href={`/admin/tickets/${ticket.publicId}`}
      className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`ticket-${ticket.publicId}`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          #{ticketRef(ticket.publicId)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {ticket.subject}
        </span>
        <TicketStatusBadge status={ticket.status} audience="staff" />
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="max-w-[40%] shrink-0 truncate font-medium text-foreground/80">
          {creatorName(ticket)}
        </span>
        <span className="shrink-0" aria-hidden="true">
          ·
        </span>
        <span className="min-w-0 flex-1 truncate">{ticket.description}</span>
        <span className="shrink-0 text-xs">{formatDate(ticket.createdAt)}</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );
}
