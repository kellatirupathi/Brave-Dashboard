// Ticket Support — the staff queue (additive, isolated).
//
// Three tabs answer three different questions. Active: what still needs
// somebody. Closed: what was answered, and what we said. My tickets:
// everything I hold — both what is still on my plate and what I have already
// closed, because "what did I answer last week" is as real a question as
// "what do I owe".
//
// Assigning is deliberately reversible: a ticket someone else already took can
// be handed on, because in practice the wrong person picks things up and the
// alternative is a ticket stuck behind whoever clicked first.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy,
  Search,
  Paperclip,
  UserPlus,
  CheckCircle2,
  Clock,
  Loader2,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  assignTicket,
  getTicketAssignees,
  getTicketQueue,
  resolveTicket,
  ticketKeys,
  ticketRef,
  type Ticket,
  type TicketScope,
  type TicketStatus,
} from "@/lib/tickets-api";
import {
  TICKET_CATEGORY_TREE,
  categoryLabel,
} from "@/lib/ticket-categories";

const STATUS_STYLES: Record<
  TicketStatus,
  { label: string; className: string; icon: typeof Clock }
> = {
  open: {
    label: "Open",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    icon: Clock,
  },
  in_progress: {
    label: "In progress",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: Loader2,
  },
  resolved: {
    label: "Closed",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: CheckCircle2,
  },
};

const TABS: { key: TicketScope; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
  { key: "mine", label: "My tickets" },
];

function shortName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.length > 28 ? `${name.slice(0, 14)}…${name.slice(-10)}` : name;
}

function creatorName(t: Ticket): string {
  const name = `${t.creatorFirstName ?? ""} ${t.creatorLastName ?? ""}`.trim();
  return name || t.creatorEmail || "Unknown";
}

export default function AdminTickets() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [scope, setScope] = useState<TicketScope>("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [resolving, setResolving] = useState<Ticket | null>(null);
  const [assigning, setAssigning] = useState<Ticket | null>(null);

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

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ["tickets-queue"] });
  };

  const assignMutation = useMutation({
    mutationFn: ({ id, to: assignTo }: { id: string; to?: string }) =>
      assignTicket(id, assignTo),
    onSuccess: () => {
      setAssigning(null);
      refresh();
      toast({ title: "Ticket assigned" });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not assign the ticket",
        description: err.message,
        variant: "destructive",
      }),
  });

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
        <div className="space-y-3">
          {tickets.map((t) => (
            <AdminTicketCard
              key={t.publicId}
              ticket={t}
              currentUserId={user?.id ?? ""}
              onAssignToMe={() => assignMutation.mutate({ id: t.publicId })}
              onReassign={() => setAssigning(t)}
              onResolve={() => setResolving(t)}
              busy={assignMutation.isPending}
            />
          ))}
        </div>
      )}

      <ResolveDialog
        ticket={resolving}
        onClose={() => setResolving(null)}
        onResolved={() => {
          setResolving(null);
          refresh();
          toast({
            title: "Ticket closed",
            description: "The student has been emailed your reply.",
          });
        }}
      />

      <AssignDialog
        ticket={assigning}
        onClose={() => setAssigning(null)}
        onAssign={(userId) =>
          assigning &&
          assignMutation.mutate({ id: assigning.publicId, to: userId })
        }
        busy={assignMutation.isPending}
      />
    </div>
  );
}

function AdminTicketCard({
  ticket,
  currentUserId,
  onAssignToMe,
  onReassign,
  onResolve,
  busy,
}: {
  ticket: Ticket;
  currentUserId: string;
  onAssignToMe: () => void;
  onReassign: () => void;
  onResolve: () => void;
  busy: boolean;
}) {
  const status = STATUS_STYLES[ticket.status];
  const StatusIcon = status.icon;
  const mine = ticket.assignedTo === currentUserId;
  const closed = ticket.status === "resolved";

  return (
    <Card className="p-4 sm:p-5" data-testid={`ticket-${ticket.publicId}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-muted-foreground">
              #{ticketRef(ticket.publicId)}
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {categoryLabel(ticket.category)}
            </span>
            {ticket.subcategory && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                {ticket.subcategory}
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border",
                status.className,
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {status.label}
            </span>
          </div>
          <h3 className="font-medium mt-1.5 break-words">{ticket.subject}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {creatorName(ticket)}
            {ticket.creatorNiatId && ` · ${ticket.creatorNiatId}`}
            {ticket.campusName && ` · ${ticket.campusName}`}
            {` · ${formatDate(ticket.createdAt)}`}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!closed && !ticket.assignedTo && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAssignToMe}
              disabled={busy}
              data-testid="button-assign-me"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Assign to me
            </Button>
          )}
          {!closed && !!ticket.assignedTo && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReassign}
              disabled={busy}
              data-testid="button-reassign"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              {mine ? "Hand over" : "Reassign"}
            </Button>
          )}
          {!closed && (
            <Button size="sm" onClick={onResolve} data-testid="button-resolve">
              Answer & close
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap break-words">
        {ticket.description}
      </p>

      {!!ticket.attachments?.length && (
        <div className="flex flex-wrap gap-2 mt-3">
          {ticket.attachments.map((path) => (
            <a
              key={path}
              href={path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border hover:bg-muted transition-colors"
            >
              <Paperclip className="w-3 h-3" />
              {shortName(path)}
            </a>
          ))}
        </div>
      )}

      {closed && ticket.resolution && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Reply sent{ticket.resolvedAt && ` ${formatDate(ticket.resolvedAt)}`}
          </p>
          <div
            className="mt-1.5 text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: ticket.resolution }}
          />
        </div>
      )}
    </Card>
  );
}

function ResolveDialog({
  ticket,
  onClose,
  onResolved,
}: {
  ticket: Ticket | null;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { toast } = useToast();
  const [html, setHtml] = useState("");

  const mutation = useMutation({
    mutationFn: () => resolveTicket(ticket!.publicId, html),
    onSuccess: () => {
      setHtml("");
      onResolved();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not close the ticket",
        description: err.message,
        variant: "destructive",
      }),
  });

  // Tags carry no words, so strip them before deciding whether anything was
  // actually written — an empty editor still holds a <br> or two.
  const hasText = html.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <Dialog
      open={!!ticket}
      onOpenChange={(v) => {
        if (!v) {
          setHtml("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Answer ticket #{ticket ? ticketRef(ticket.publicId) : ""}
          </DialogTitle>
        </DialogHeader>

        {ticket && (
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-sm font-medium">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
              {ticket.description}
            </p>
          </div>
        )}

        <div>
          <label className="text-sm font-medium">Your reply</label>
          <p className="text-xs text-muted-foreground mb-1.5">
            This is emailed to the student and shown on their ticket. Submitting
            closes the ticket.
          </p>
          <RichTextEditor
            value={html}
            onChange={setHtml}
            placeholder="Explain what you found and what they should do next…"
            data-testid="editor-resolution"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setHtml("");
              onClose();
            }}
          >
            Close
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!hasText || mutation.isPending}
            data-testid="button-submit-resolution"
          >
            {mutation.isPending ? "Sending…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  ticket,
  onClose,
  onAssign,
  busy,
}: {
  ticket: Ticket | null;
  onClose: () => void;
  onAssign: (userId: string) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState("");

  const assigneesQ = useQuery({
    queryKey: ticketKeys.assignees(),
    queryFn: getTicketAssignees,
    enabled: !!ticket,
  });
  const assignees = assigneesQ.data?.assignees ?? [];

  return (
    <Dialog
      open={!!ticket}
      onOpenChange={(v) => {
        if (!v) {
          setSelected("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hand this ticket to someone</DialogTitle>
        </DialogHeader>

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger data-testid="select-assignee">
            <SelectValue placeholder="Choose a team member" />
          </SelectTrigger>
          <SelectContent>
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {`${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() ||
                  a.email ||
                  a.id}
                {a.role ? ` · ${a.role}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setSelected("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onAssign(selected)}
            disabled={!selected || busy}
            data-testid="button-confirm-assign"
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
