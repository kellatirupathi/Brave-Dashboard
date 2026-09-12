// Ticket detail — the student's side (additive, isolated).
//
// The whole conversation on one ticket: what the student asked, every reply
// from the BRAVE team, and every follow-up since. A follow-up is sent on the
// same ticket rather than as a new one, so the team answering it can see
// everything that was already said.
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { TicketStatusBadge } from "@/components/ticket-status-badge";
import {
  TicketAttachments,
  TicketBubble,
  TicketMessageText,
} from "@/components/ticket-thread";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { categoryLabel } from "@/lib/ticket-categories";
import {
  getTicket,
  getTicketsConfig,
  sendFollowUp,
  ticketKeys,
  ticketRef,
} from "@/lib/tickets-api";

// Matches the server bound, so the button is only live when sending works.
const FOLLOW_UP_MIN = 2;

export default function StudentTicketDetail() {
  const [, params] = useRoute("/tickets/:publicId");
  const publicId = params?.publicId ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const detailQ = useQuery({
    queryKey: ticketKeys.detail(publicId),
    queryFn: () => getTicket(publicId),
    enabled: !!publicId,
    retry: false,
  });
  const configQ = useQuery({
    queryKey: ticketKeys.config(),
    queryFn: getTicketsConfig,
  });
  const canFollowUp = configQ.data?.permissions.add ?? false;

  const followUp = useMutation({
    mutationFn: () => sendFollowUp(publicId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      void qc.invalidateQueries({ queryKey: ticketKeys.detail(publicId) });
      void qc.invalidateQueries({ queryKey: ticketKeys.mine() });
      toast({
        title: "Follow-up sent",
        description: "Your ticket is back with the BRAVE team.",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not send your follow-up",
        description: err.message,
        variant: "destructive",
      }),
  });

  const back = (
    <Link
      href="/tickets"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      All tickets
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
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        {back}
        <Card className="p-10 text-center">
          <LifeBuoy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">We could not find that ticket</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been raised from another account.
          </p>
        </Card>
      </div>
    );
  }

  const { ticket, messages } = detailQ.data;
  const answered = ticket.status === "resolved";

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
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
            <span className="text-[11px] text-muted-foreground">
              {ticket.subcategory}
            </span>
          )}
          <TicketStatusBadge
            status={ticket.status}
            audience="student"
            className="ml-auto"
          />
        </div>
        <h1 className="mt-2 break-words text-xl font-semibold">
          {ticket.subject}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Raised {formatDate(ticket.createdAt)}
        </p>
      </Card>

      <div className="space-y-3" data-testid="ticket-thread">
        <TicketBubble kind="student" author="You" at={ticket.createdAt}>
          <TicketMessageText
            message={{ authorKind: "student", body: ticket.description }}
          />
          <TicketAttachments paths={ticket.attachments} />
        </TicketBubble>

        {messages.map((m) => (
          <TicketBubble
            key={m.id}
            kind={m.authorKind}
            author={m.authorKind === "staff" ? m.authorName : "You"}
            at={m.createdAt}
            edited={!!m.editedAt}
          >
            <TicketMessageText message={m} />
          </TicketBubble>
        ))}
      </div>

      {canFollowUp && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">
              {answered ? "Still stuck?" : "Add more detail"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {answered
                ? "Send a follow-up and this ticket goes straight back to the BRAVE team."
                : "Anything you add here goes to the team working on your ticket."}
            </p>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write your follow-up question…"
            rows={4}
            maxLength={5000}
            data-testid="input-follow-up"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => followUp.mutate()}
              disabled={draft.trim().length < FOLLOW_UP_MIN || followUp.isPending}
              data-testid="button-send-follow-up"
            >
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {followUp.isPending ? "Sending…" : "Send follow-up"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
