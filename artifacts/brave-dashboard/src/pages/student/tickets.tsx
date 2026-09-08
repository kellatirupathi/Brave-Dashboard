// Ticket Support — the student's side (additive, isolated).
//
// A student raises a ticket and then wants one thing: to know whether anybody
// has looked at it. So the list leads with status, and a closed ticket shows
// the answer inline rather than behind another click — the reply is the whole
// point of the page.
//
// Everything here is governed by the season's ticket controls. If an admin has
// not enabled the feature the sidebar entry is absent; if `add` is off the
// form is absent too, and the list still reads.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy,
  Plus,
  Paperclip,
  X,
  CheckCircle2,
  Clock,
  Loader2,
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  createTicket,
  getMyTickets,
  getTicketsConfig,
  ticketKeys,
  ticketRef,
  type Ticket,
  type TicketStatus,
} from "@/lib/tickets-api";
import {
  TICKET_CATEGORY_TREE,
  categoryLabel,
  subcategoriesFor,
  type TicketCategory,
} from "@/lib/ticket-categories";

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

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
    label: "Being looked at",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    icon: Loader2,
  },
  resolved: {
    label: "Answered",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    icon: CheckCircle2,
  },
};

/** Keeps a long filename readable without losing what kind of file it is. */
function shortName(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.length > 28 ? `${name.slice(0, 14)}…${name.slice(-10)}` : name;
}

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
        <div className="space-y-3">
          {tickets.map((t) => (
            <TicketCard key={t.publicId} ticket={t} />
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

function TicketCard({ ticket }: { ticket: Ticket }) {
  const status = STATUS_STYLES[ticket.status];
  const StatusIcon = status.icon;

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
              <span className="text-[11px] text-muted-foreground">
                {ticket.subcategory}
              </span>
            )}
          </div>
          <h3 className="font-medium mt-1 break-words">{ticket.subject}</h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border shrink-0",
            status.className,
          )}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {status.label}
        </span>
      </div>

      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap break-words">
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

      {ticket.status === "resolved" && ticket.resolution && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Reply from the BRAVE team
          </p>
          {/* Sanitised server-side before it was stored — see
              api-server/src/lib/sanitize-html.ts. */}
          <div
            className="mt-1.5 text-sm [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: ticket.resolution }}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-3">
        Raised {formatDate(ticket.createdAt)}
        {ticket.resolvedAt && ` · Answered ${formatDate(ticket.resolvedAt)}`}
      </p>
    </Card>
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
                  {shortName(path)}
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
