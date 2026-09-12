// Ticket Support — the student's side (additive, isolated).
//
// A student raises a ticket and then wants one thing: to know whether anybody
// has looked at it. So the list is compact — reference, subject, status and
// the first line of what they wrote — and opening a ticket shows the whole
// conversation, where a follow-up can be sent on the same ticket.
//
// Everything here is governed by the season's ticket controls. If an admin has
// not enabled the feature the sidebar entry is absent; if `add` is off the
// form is absent too, and the list still reads.
import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  LifeBuoy,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { TicketStatusBadge } from "@/components/ticket-status-badge";
import { attachmentName } from "@/components/ticket-thread";
import { useToast } from "@/hooks/use-toast";
import {
  createTicket,
  getMyTickets,
  getTicketsConfig,
  ticketKeys,
  ticketRef,
  type Ticket,
} from "@/lib/tickets-api";
import {
  TICKET_CATEGORY_TREE,
  subcategoriesFor,
  type TicketCategory,
} from "@/lib/ticket-categories";

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

// Past this, the one-line preview is cut off, so the row says there is more.
const PREVIEW_CHARS = 90;

export default function StudentTickets() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const configQ = useQuery({
    queryKey: ticketKeys.config(),
    queryFn: getTicketsConfig,
  });
  const ticketsQ = useQuery({
    queryKey: ticketKeys.mine(),
    queryFn: getMyTickets,
  });

  const canAdd = configQ.data?.permissions.add ?? false;
  const tickets = ticketsQ.data?.tickets ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary" />
            Ticket Support
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stuck on something? Raise a ticket and the BRAVE team will get back
            to you.
          </p>
        </div>
        {canAdd && (
          <Button
            onClick={() => setShowForm(true)}
            data-testid="button-raise-ticket"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Raise a ticket
          </Button>
        )}
      </div>

      {ticketsQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="p-10 text-center">
          <LifeBuoy className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 font-medium">No tickets yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {canAdd
              ? "When something blocks you, raise a ticket here and we'll pick it up."
              : "Raising tickets is turned off at the moment."}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <TicketRow key={t.publicId} ticket={t} />
          ))}
        </div>
      )}

      {canAdd && (
        <RaiseTicketDialog
          open={showForm}
          onOpenChange={setShowForm}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ticketKeys.mine() });
            toast({
              title: "Ticket raised",
              description: "We've emailed you a copy. We'll be in touch.",
            });
          }}
        />
      )}
    </div>
  );
}

/**
 * Two lines: the reference, subject and status, then the start of what the
 * student wrote. Everything else waits on the ticket page.
 */
function TicketRow({ ticket }: { ticket: Ticket }) {
  const long = ticket.description.length > PREVIEW_CHARS;
  return (
    <Link
      href={`/tickets/${ticket.publicId}`}
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
        <TicketStatusBadge status={ticket.status} audience="student" />
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{ticket.description}</span>
        {long && (
          <span className="shrink-0 text-xs font-medium text-primary">
            Read more
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );
}

function RaiseTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  // No default category: a pre-selected one gets submitted unchanged, which is
  // how every ticket ends up in the same bucket.
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploader = useUpload({
    maxBytes: MAX_BYTES,
    onError: (error) =>
      toast({
        title: "Could not attach that file",
        description: error.message,
        variant: "destructive",
      }),
  });

  const reset = (): void => {
    setSubject("");
    setDescription("");
    setCategory("");
    setSubcategory("");
    setAttachments([]);
  };

  const mutation = useMutation({
    mutationFn: () =>
      createTicket({
        subject: subject.trim(),
        description: description.trim(),
        category,
        subcategory,
        attachments: attachments.length ? attachments : undefined,
      }),
    onSuccess: () => {
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not raise the ticket",
        description: err.message,
        variant: "destructive",
      }),
  });

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast({
        title: "That is the limit",
        description: `You can attach up to ${MAX_ATTACHMENTS} files.`,
      });
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        if (file.size > MAX_BYTES) {
          toast({
            title: "That file is too large",
            description: `${file.name} is over 5 MB.`,
            variant: "destructive",
          });
          continue;
        }
        const result = await uploader.uploadFile(file);
        if (result?.objectPath) {
          setAttachments((a) => [...a, result.objectPath]);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  // The server enforces these same bounds; matching them here means the button
  // is only enabled when the request would actually succeed.
  const valid =
    !!category &&
    !!subcategory &&
    subject.trim().length >= 3 &&
    description.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise a ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v as TicketCategory);
                  // The old sub-category belongs to a different list now, so
                  // clear it rather than submitting a mismatched pair.
                  setSubcategory("");
                }}
              >
                <SelectTrigger
                  className="mt-1.5"
                  data-testid="select-category"
                >
                  <SelectValue placeholder="Choose an area" />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORY_TREE.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">What's happening?</label>
              <Select
                value={subcategory}
                onValueChange={setSubcategory}
                disabled={!category}
              >
                <SelectTrigger
                  className="mt-1.5"
                  data-testid="select-subcategory"
                >
                  <SelectValue
                    placeholder={
                      category ? "Choose the closest one" : "Pick a category first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {subcategoriesFor(category).map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A one-line summary"
              maxLength={200}
              className="mt-1.5"
              data-testid="input-subject"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Tell us more</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us what you tried and what happened. The more detail, the faster we can help."
              rows={5}
              maxLength={5000}
              className="mt-1.5"
              data-testid="input-description"
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Attachments{" "}
              <span className="font-normal text-muted-foreground">
                (optional, up to {MAX_ATTACHMENTS})
              </span>
            </label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {attachments.map((path) => (
                <span
                  key={path}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border bg-muted/40"
                >
                  <Paperclip className="w-3 h-3" />
                  {attachmentName(path)}
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((a) => a.filter((p) => p !== path))
                    }
                    aria-label="Remove attachment"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {attachments.length < MAX_ATTACHMENTS && (
              <label className="inline-flex items-center gap-1.5 text-xs mt-2 px-2.5 py-1.5 rounded border cursor-pointer hover:bg-muted transition-colors">
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Paperclip className="w-3.5 h-3.5" />
                )}
                {uploading ? "Uploading…" : "Add a file"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending || uploading}
            data-testid="button-submit-ticket"
          >
            {mutation.isPending ? "Sending…" : "Submit ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
