// Ticket detail — the staff side (additive, isolated).
//
// One ticket and its whole conversation: the opening question, every staff
// reply and every student follow-up, oldest first. This is where a ticket is
// assigned and answered, and where a reply is corrected or withdrawn.
//
// A reply can be corrected on a closed ticket too, and the student is emailed
// the new version. Deleting the only reply puts the ticket back in the Active
// queue, since it is no longer answered. What each admin may do follows their
// Ticket Support permissions; super admins may do everything.
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  LifeBuoy,
  Pencil,
  Send,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/rich-text-editor";
import { TicketStatusBadge } from "@/components/ticket-status-badge";
import {
  TicketAttachments,
  TicketBubble,
  TicketMessageText,
} from "@/components/ticket-thread";
import { useToast } from "@/hooks/use-toast";
import { canAccess, useMyAdminAccess } from "@/lib/admin-access";
import { formatDate } from "@/lib/format";
import { categoryLabel } from "@/lib/ticket-categories";
import {
  assignTicket,
  deleteTicketReply,
  editTicketReply,
  getTicket,
  getTicketAssignees,
  resolveTicket,
  ticketKeys,
  ticketRef,
  type TicketAssignee,
  type TicketMessage,
} from "@/lib/tickets-api";

const PAGE_KEY = "/admin/tickets";

/** An empty editor still holds a <br> or two, so read the words, not tags. */
function hasText(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim().length > 0
  );
}

function personName(person: TicketAssignee | undefined): string | null {
  if (!person) return null;
  return (
    `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() ||
    person.email ||
    null
  );
}

export default function AdminTicketDetail() {
  const [, params] = useRoute("/admin/tickets/:publicId");
  const publicId = params?.publicId ?? "";
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Admins follow their Ticket Support permissions. Coordinators have no
  // permission map, so — like an unrestricted admin — they are allowed, and
  // the server applies the same rule.
  const isAdmin = user?.role === "admin";
  const { data: access } = useMyAdminAccess(isAdmin);
  const canEdit = canAccess(access, PAGE_KEY, "edit");
  const canDelete = canAccess(access, PAGE_KEY, "delete");

  const [reply, setReply] = useState("");
  const [editing, setEditing] = useState<{ id: number; html: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<TicketMessage | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ticketKeys.detail(publicId),
    queryFn: () => getTicket(publicId),
    enabled: !!publicId,
    retry: false,
  });
  const assigneesQ = useQuery({
    queryKey: ticketKeys.assignees(),
    queryFn: getTicketAssignees,
  });
  const assignees = assigneesQ.data?.assignees ?? [];

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ticketKeys.detail(publicId) });
    void qc.invalidateQueries({ queryKey: ["tickets-queue"] });
  };
  const failed =
    (title: string) =>
    (err: Error): void => {
      toast({ title, description: err.message, variant: "destructive" });
    };

  const assign = useMutation({
    mutationFn: (to: string | undefined) => assignTicket(publicId, to),
    onSuccess: () => {
      setAssignOpen(false);
      refresh();
      toast({ title: "Ticket assigned" });
    },
    onError: failed("Could not assign the ticket"),
  });

  const send = useMutation({
    mutationFn: () => resolveTicket(publicId, reply),
    onSuccess: () => {
      setReply("");
      refresh();
      toast({
        title: "Reply sent",
        description: "The ticket is closed and the student has been emailed.",
      });
    },
    onError: failed("Could not send the reply"),
  });

  const save = useMutation({
    mutationFn: (change: { id: number; html: string }) =>
      editTicketReply(publicId, change.id, change.html),
    onSuccess: () => {
      setEditing(null);
      refresh();
      toast({
        title: "Reply updated",
        description: "The student has been emailed the new version.",
      });
    },
    onError: failed("Could not update the reply"),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteTicketReply(publicId, id),
    onSuccess: () => {
      refresh();
      toast({ title: "Reply deleted" });
    },
    onError: failed("Could not delete the reply"),
  });

  const back = (
    <Link
      href="/admin/tickets"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Ticket Support
    </Link>
  );

  if (detailQ.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (detailQ.isError || !detailQ.data) {
    return (
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        {back}
        <Card className="p-10 text-center">
          <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">We could not find that ticket</p>
        </Card>
      </div>
    );
  }

  const { ticket, messages } = detailQ.data;
  const closed = ticket.status === "resolved";
  const last = messages[messages.length - 1];
  const awaitingReply = last?.authorKind === "student";
  const staffReplies = messages.filter((m) => m.authorKind === "staff").length;
  const student =
    `${ticket.creatorFirstName ?? ""} ${ticket.creatorLastName ?? ""}`.trim() ||
    ticket.creatorEmail ||
    "Student";
  const mine = !!user && ticket.assignedTo === user.id;
  const holder = ticket.assignedTo
    ? mine
      ? "you"
      : (personName(assignees.find((a) => a.id === ticket.assignedTo)) ??
        "a team member")
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      {back}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            #{ticketRef(ticket.publicId)}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {categoryLabel(ticket.category)}
          </span>
          {ticket.subcategory && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {ticket.subcategory}
            </span>
          )}
          <TicketStatusBadge
            status={ticket.status}
            audience="staff"
            className="ml-auto"
          />
        </div>
        <h1 className="mt-2 break-words text-xl font-semibold">
          {ticket.subject}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {student}
          {ticket.creatorNiatId && ` · ${ticket.creatorNiatId}`}
          {ticket.campusName && ` · ${ticket.campusName}`}
          {` · Raised ${formatDate(ticket.createdAt)}`}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {holder ? (
              <>
                Assigned to{" "}
                <span className="font-medium text-foreground">{holder}</span>
              </>
            ) : (
              "Not assigned yet"
            )}
          </p>
          {canEdit && (
            <div className="flex gap-2">
              {!ticket.assignedTo ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => assign.mutate(undefined)}
                  disabled={assign.isPending}
                  data-testid="button-assign-me"
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Assign to me
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignOpen(true)}
                  disabled={assign.isPending}
                  data-testid="button-reassign"
                >
                  <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {mine ? "Hand over" : "Reassign"}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-3" data-testid="ticket-thread">
        <TicketBubble kind="student" author={student} at={ticket.createdAt}>
          <TicketMessageText
            message={{ authorKind: "student", body: ticket.description }}
          />
          <TicketAttachments paths={ticket.attachments} />
        </TicketBubble>

        {messages.map((m) => {
          const isStaff = m.authorKind === "staff";

          if (isStaff && editing?.id === m.id) {
            return (
              <TicketBubble
                key={m.id}
                kind="staff"
                author={m.authorName}
                at={m.createdAt}
                edited={!!m.editedAt}
              >
                <RichTextEditor
                  value={editing.html}
                  onChange={(html) => setEditing({ id: m.id, html })}
                  placeholder="Correct the reply…"
                  data-testid={`editor-reply-${m.id}`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Saving emails the student the corrected reply.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(null)}
                    disabled={save.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => save.mutate(editing)}
                    disabled={!hasText(editing.html) || save.isPending}
                    data-testid={`button-save-reply-${m.id}`}
                  >
                    {save.isPending ? "Saving…" : "Save & email"}
                  </Button>
                </div>
              </TicketBubble>
            );
          }

          const actions =
            isStaff && (canEdit || canDelete) ? (
              <div className="flex shrink-0 gap-1">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing({ id: m.id, html: m.body })}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Edit reply"
                    aria-label="Edit reply"
                    data-testid={`button-edit-reply-${m.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setDeleting(m)}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Delete reply"
                    aria-label="Delete reply"
                    data-testid={`button-delete-reply-${m.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : undefined;

          return (
            <TicketBubble
              key={m.id}
              kind={m.authorKind}
              author={isStaff ? m.authorName : student}
              at={m.createdAt}
              edited={!!m.editedAt}
              actions={actions}
            >
              <TicketMessageText message={m} />
            </TicketBubble>
          );
        })}
      </div>

      {canEdit && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">
              {awaitingReply
                ? "Reply to the follow-up"
                : closed
                  ? "Add another reply"
                  : "Reply to the student"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Sending closes the ticket and emails the student.
            </p>
          </div>
          <RichTextEditor
            value={reply}
            onChange={setReply}
            placeholder="Explain what you found and what they should do next…"
            data-testid="editor-resolution"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => send.mutate()}
              disabled={!hasText(reply) || send.isPending}
              data-testid="button-submit-resolution"
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {send.isPending ? "Sending…" : "Send reply & close"}
            </Button>
          </div>
        </Card>
      )}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        assignees={assignees}
        busy={assign.isPending}
        onAssign={(userId) => assign.mutate(userId)}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reply?</AlertDialogTitle>
            <AlertDialogDescription>
              The student will no longer see it.
              {staffReplies <= 1 &&
                " It is the only reply, so the ticket goes back into the Active queue."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-reply"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AssignDialog({
  open,
  onOpenChange,
  assignees,
  busy,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignees: TicketAssignee[];
  busy: boolean;
  onAssign: (userId: string) => void;
}) {
  const [selected, setSelected] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSelected("");
        onOpenChange(next);
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
                {personName(a) ?? a.id}
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
              onOpenChange(false);
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
