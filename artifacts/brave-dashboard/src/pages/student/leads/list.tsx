// Season 2 — Stage 1: the lead board, plus the capture form.
//
// Replaces "Projects" in the Season 2 sidebar. Season 1 keeps its own Projects
// page untouched; this route is additive and only reachable while Season 2 is
// the season being viewed.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus,
  MapPin,
  Phone,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Building2,
  ChevronRight,
  Users,
  CalendarDays,
  Mic,
  Pause,
  Play,
  Square,
  X,
  Camera,
  Upload,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ListSkeleton } from "@/components/skeletons";
import { isNativeApp } from "@/lib/native-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDictation } from "@/hooks/use-dictation";
import { useUpload } from "@workspace/object-storage-web";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import { formatDate } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { LeadsLockBanner } from "@/components/leads-lock-banner";
import { useLeadsControl } from "@/lib/leads-control-api";
import {
  createLead,
  getPipelineStatus,
  leadKeys,
  listLeads,
  OPEN_STAGES,
  STAGE_LABEL,
  type CreateLeadBody,
  type LeadListRow,
  type TrailBand,
  leadRef,
} from "@/lib/leads-api";
import { successFeedback, errorFeedback } from "@/lib/haptics";

const SOURCES = [
  { value: "walk_in", label: "Walked in / I visited them" },
  { value: "online", label: "Found them online" },
  { value: "referral", label: "Someone referred them" },
  { value: "known_contact", label: "I already knew them" },
] as const;

const CATEGORIES = [
  { value: "retail", label: "Retail / shop" },
  { value: "food_beverage", label: "Food & beverage" },
  { value: "clinic", label: "Clinic / healthcare" },
  { value: "salon", label: "Salon / wellness" },
  { value: "education", label: "Education" },
  { value: "services", label: "Services" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "other", label: "Other" },
] as const;

const MODES = [
  { value: "in_person", label: "In person" },
  { value: "phone", label: "Phone" },
  { value: "video", label: "Video call" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

const BAND_TONE: Record<TrailBand, string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  weak: "bg-rose-100 text-rose-800 border-rose-200",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** A field label that says whether it is required, because 10 of 17 are. */
/** The server caps evidence at 10; the grid shows five to a row. */
const MAX_PHOTOS = 10;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string;
}) {
  // A plain <select> rather than the Radix one: this form has five of them and
  // native selects are markedly better on the phone, which is where a lead is
  // actually captured — standing in the client's shop.
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // h-11 (44px) is the minimum comfortable touch target; the shared h-9
      // is a desktop size and is genuinely hard to hit one-handed. text-base
      // stops iOS Safari zooming the page in when the control takes focus,
      // which on a 14px control it always does.
      className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:h-9 sm:text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const EMPTY: CreateLeadBody = {
  source: "",
  businessName: "",
  ownerName: "",
  phone: "",
  businessCategory: "",
  city: "",
  firstMeetingDate: todayIso(),
  meetingMode: "",
  conversationNote: "",
};

function CaptureDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { viewingId: seasonId } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [form, setForm] = useState<CreateLeadBody>(EMPTY);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const set = <K extends keyof CreateLeadBody>(
    k: K,
    v: CreateLeadBody[K],
  ): void => setForm((f) => ({ ...f, [k]: v }));

  const dictation = useDictation({
    onCommit: (chunk) =>
      setForm((f) => ({
        ...f,
        conversationNote: f.conversationNote
          ? `${f.conversationNote.trimEnd()} ${chunk}`
          : chunk,
      })),
    // Cancel takes back exactly what this run added, leaving anything the
    // student typed themselves untouched.
    onCancel: (committed) =>
      setForm((f) => {
        const note = f.conversationNote.trimEnd();
        if (!note.endsWith(committed)) return f;
        return {
          ...f,
          conversationNote: note.slice(0, note.length - committed.length).trimEnd(),
        };
      }),
  });

  // Every route out of the dialog goes through here, so the microphone is
  // never left open behind a closed sheet.
  const closeDialog = (): void => {
    dictation.stop();
    onOpenChange(false);
  };

  const photos = form.evidence ?? [];
  const photoUploader = useUpload({
    maxBytes: PHOTO_MAX_BYTES,
    onError: (error) =>
      toast({
        title: "Could not add the photo",
        description: error.message,
        variant: "destructive",
      }),
  });

  const addPhotos = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast({
        title: `That is the limit`,
        description: `You can attach up to ${MAX_PHOTOS} photos.`,
      });
      return;
    }
    setPhotoBusy(true);
    try {
      for (const file of Array.from(files).slice(0, room)) {
        // Images only — a reviewer needs to see the meeting, not read a PDF
        // about it, and the accept attribute alone is a suggestion.
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Photos only",
            description: `${file.name} is not an image.`,
            variant: "destructive",
          });
          continue;
        }
        if (file.size > PHOTO_MAX_BYTES) {
          toast({
            title: "That photo is too large",
            description: `${file.name} is over 5 MB.`,
            variant: "destructive",
          });
          continue;
        }
        const result = await photoUploader.uploadFile(file);
        if (result?.objectPath) {
          setForm((f) => ({
            ...f,
            evidence: [...(f.evidence ?? []), result.objectPath],
          }));
        }
      }
    } finally {
      setPhotoBusy(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => createLead(form),
    onSuccess: (res) => {
      successFeedback();
      void qc.invalidateQueries({ queryKey: leadKeys.list(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      dictation.stop();
      onOpenChange(false);
      setForm(EMPTY);
      // Both of these are signals, not refusals — the student is told so they
      // are not surprised later by a reviewer raising the same point.
      if (res.duplicateClientTeams.length > 0) {
        toast({
          title: "Lead saved — another team has this client",
          description: `${res.duplicateClientTeams
            .map((t) => t.teamName)
            .join(", ")} logged this number too. Keep your own evidence strong.`,
        });
      } else if (res.relatedParty) {
        toast({
          title: "Lead saved — marked as a known contact",
          description:
            "Related-party clients are reviewed more closely, so log every interaction carefully.",
        });
      } else {
        toast({ title: "Lead saved" });
      }
    },
    onError: (err: Error) => {
      errorFeedback();
      toast({
        title: "Could not save the lead",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location is not available on this device",
        variant: "destructive",
      });
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          geoLat: String(pos.coords.latitude),
          geoLng: String(pos.coords.longitude),
        }));
        setGeoBusy(false);
        toast({ title: "Location captured" });
      },
      () => {
        setGeoBusy(false);
        toast({
          title: "Could not get your location",
          description: "You can still save the lead without it.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const needsReferrer = form.source === "referral";
  const needsRelationship = form.source === "known_contact";
  const canSubmit =
    !!form.source &&
    !!form.businessName.trim() &&
    !!form.ownerName.trim() &&
    !!form.phone.trim() &&
    !!form.businessCategory &&
    !!form.city.trim() &&
    !!form.firstMeetingDate &&
    !!form.meetingMode &&
    !!form.conversationNote.trim() &&
    (!needsReferrer || !!form.referrerName?.trim()) &&
    (!needsRelationship || !!form.relationshipNote?.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dictation.stop();
        onOpenChange(next);
      }}
    >
      {/* On a phone this is a screen, not a dialog: capture happens standing
          in front of the client, and a centred sheet with its own scrollbar
          inside a scrolling page is the wrong shape for that. Same form either
          way — only the frame changes.
          sm:rounded-none is not redundant: tailwind-merge treats the base
          component's sm:rounded-lg as a separate key from rounded-none, so
          without it the sheet keeps rounded corners from 640px to 767px. */}
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0",
          isMobile
            ? "inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:rounded-none"
            : "max-h-[90vh] max-w-2xl",
        )}
      >
        <DialogHeader
          className={cn(
            "shrink-0 border-b px-5 py-4 text-left",
            isMobile && "sticky top-0 z-10 bg-background",
          )}
        >
          <DialogTitle>Log a client</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* How they met is asked FIRST, because it decides whether this is a
              related-party lead — and that changes how it is reviewed. */}
          <Field label="How did you meet them?" required>
            <Select
              value={form.source}
              onChange={(v) => set("source", v)}
              options={SOURCES}
              placeholder="Choose one"
            />
          </Field>

          {needsReferrer ? (
            <Field label="Who referred them?" required>
              <Input
                value={form.referrerName ?? ""}
                onChange={(e) => set("referrerName", e.target.value)}
              />
            </Field>
          ) : null}

          {needsRelationship ? (
            <Field
              label="How do you know them?"
              required
              hint="Be straightforward — a family or friend client is allowed, it is just reviewed more closely."
            >
              <Textarea
                rows={2}
                value={form.relationshipNote ?? ""}
                onChange={(e) => set("relationshipNote", e.target.value)}
              />
            </Field>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" required>
              <Input
                value={form.businessName}
                onChange={(e) => set("businessName", e.target.value)}
              />
            </Field>
            <Field label="Owner's name" required>
              <Input
                value={form.ownerName}
                onChange={(e) => set("ownerName", e.target.value)}
              />
            </Field>
            <Field
              label="Phone"
              required
              hint="Used to spot the same client being claimed by two teams."
            >
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Alternate phone">
              <Input
                inputMode="tel"
                value={form.altPhone ?? ""}
                onChange={(e) => set("altPhone", e.target.value)}
              />
            </Field>
            <Field label="Type of business" required>
              <Select
                value={form.businessCategory}
                onChange={(v) => set("businessCategory", v)}
                options={CATEGORIES}
                placeholder="Choose one"
              />
            </Field>
            <Field label="City" required>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="Area / locality">
              <Input
                value={form.areaLocality ?? ""}
                onChange={(e) => set("areaLocality", e.target.value)}
              />
            </Field>
            <Field label="First meeting date" required>
              <Input
                type="date"
                max={todayIso()}
                value={form.firstMeetingDate}
                onChange={(e) => set("firstMeetingDate", e.target.value)}
              />
            </Field>
            <Field label="How did you meet?" required>
              <Select
                value={form.meetingMode}
                onChange={(v) => set("meetingMode", v)}
                options={MODES}
                placeholder="Choose one"
              />
            </Field>
            <Field label="Estimated value (₹)">
              <Input
                inputMode="numeric"
                value={form.estimatedValue ?? ""}
                onChange={(e) =>
                  set(
                    "estimatedValue",
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
              />
            </Field>
          </div>

          {/* Not a <Field>: that wraps its children in a <label>, so a click
              on any of these buttons would focus the textarea instead. */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="conversation-note"
                className="text-sm font-medium"
              >
                What did they say?
                <span className="ml-0.5 text-destructive">*</span>
              </label>
              {dictation.supported ? (
                <div className="flex items-center gap-1.5">
                  {dictation.state === "idle" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={dictation.start}
                    >
                      <Mic className="mr-1.5 h-3.5 w-3.5" />
                      Speak
                    </Button>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full bg-destructive",
                            dictation.state === "listening" && "animate-pulse",
                          )}
                          aria-hidden="true"
                        />
                        {dictation.state === "listening"
                          ? "Listening…"
                          : "Paused"}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={
                          dictation.state === "listening" ? "Pause" : "Resume"
                        }
                        onClick={
                          dictation.state === "listening"
                            ? dictation.pause
                            : dictation.resume
                        }
                      >
                        {dictation.state === "listening" ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Stop and keep the text"
                        onClick={dictation.stop}
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Cancel and discard"
                        onClick={dictation.cancel}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <Textarea
              id="conversation-note"
              rows={5}
              value={form.conversationNote}
              onChange={(e) => set("conversationNote", e.target.value)}
            />
            {/* Words heard but not yet finalised. Shown separately so the
                field itself only ever holds text that is settled. */}
            {dictation.interim ? (
              <p className="text-xs italic text-muted-foreground">
                {dictation.interim}
              </p>
            ) : null}
            <span className="block text-xs text-muted-foreground">
              Their words, not a summary. This is the strongest part of your
              trail.
            </span>
          </div>

          <Field label="What problem do they have?">
            <Textarea
              rows={2}
              value={form.painPoint ?? ""}
              onChange={(e) => set("painPoint", e.target.value)}
            />
          </Field>

          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Location</p>
                <p className="text-xs text-muted-foreground">
                  {form.geoLat
                    ? "Captured at the client's premises."
                    : "Optional, but it is the strongest evidence you were there."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={geoBusy}
                onClick={useMyLocation}
              >
                <MapPin className="mr-1.5 h-3.5 w-3.5" />
                {form.geoLat ? "Captured" : geoBusy ? "Getting…" : "Use my location"}
              </Button>
            </div>
          </div>

          {/* Meet proofs. Sits after Location because both answer the same
              question — were you actually there. */}
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Meet proofs</p>
                <p className="text-xs text-muted-foreground">
                  {photos.length > 0
                    ? `${photos.length} of ${MAX_PHOTOS} added.`
                    : "A photo with the owner, the shopfront, or a visiting card."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoBusy || photos.length >= MAX_PHOTOS}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoBusy || photos.length >= MAX_PHOTOS}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload
                </Button>
              </div>
            </div>

            {/* capture="environment" asks a phone for the rear camera; on a
                desktop it degrades to an ordinary file picker. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />

            {photoBusy ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" />
                Adding photo…
              </p>
            ) : null}

            {photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {photos.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="group relative aspect-square overflow-hidden rounded border bg-background"
                  >
                    <img
                      src={resolveStoredObjectUrl(url)}
                      alt={`Meet proof ${index + 1}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          evidence: (f.evidence ?? []).filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                      className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-destructive shadow-sm"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Cancel left, Save right, both reachable with a thumb. On desktop
            it stays the usual right-aligned dialog footer. */}
        <div
          className={cn(
            "shrink-0 border-t bg-background p-4",
            isMobile
              ? "flex items-center justify-between gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              : "flex justify-end gap-2",
          )}
        >
          <Button
            variant={isMobile ? "outline" : "ghost"}
            className={cn(isMobile && "flex-1")}
            onClick={closeDialog}
          >
            Cancel
          </Button>
          <Button
            className={cn(isMobile && "flex-1")}
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save lead"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Which group of leads the board is showing. */
type LeadFilter = "all" | "open" | "closed";

// A lead reads as one full-width row rather than a tile: the fields line up
// down the page, so twenty leads can be scanned in one pass.
//
// The tint is the ONLY difference between an open and a closed lead's row --
// deliberately very light, so it groups at a glance without competing with
// the badges, which carry the actual detail.
const ROW_TONE = {
  open:
    "border-sky-200/70 bg-sky-50/80 hover:bg-sky-50 " +
    "dark:border-sky-900/50 dark:bg-sky-950/30 dark:hover:bg-sky-950/50",
  closed:
    "border-stone-300/60 bg-stone-100/70 hover:bg-stone-100 " +
    "dark:border-stone-700/60 dark:bg-stone-900/40 dark:hover:bg-stone-900/60",
} as const;

/** "2 days ago" from a silent-day count, the way a phone list reads. */
function relativeContact(lead: LeadListRow): string {
  if (!lead.lastInteractionDate) return "No contact yet";
  const d = lead.silentDays;
  if (d == null) return formatDate(lead.lastInteractionDate);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "1 week ago";
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  if (d < 60) return "1 month ago";
  return `${Math.floor(d / 30)} months ago`;
}

const MOBILE_TONE = {
  open: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    label: "Working on",
  },
  closed: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    label: "Closed",
  },
} as const;

/**
 * The phone card. Deliberately a different shape from the desktop row: an
 * icon block, the client, and one metadata strip — everything a student needs
 * to pick a lead, and nothing that would push the card past a thumb's reach.
 * Roughly 140px tall, so three fit on a screen with the journey above.
 */
function MobileLeadCard({
  lead,
  tone,
}: {
  lead: LeadListRow;
  tone: keyof typeof MOBILE_TONE;
}) {
  const t = MOBILE_TONE[tone];
  return (
    <Link href={`/leads/${leadRef(lead)}`}>
      <Card
        className="cursor-pointer overflow-hidden p-0 transition-colors active:bg-muted/40"
        data-testid={`mobile-lead-${lead.id}`}
      >
        <div className="flex items-start gap-3 p-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              t.icon,
            )}
          >
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-base font-semibold leading-tight">
                {lead.businessName}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  t.pill,
                )}
              >
                {t.label}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {[lead.areaLocality, lead.city].filter(Boolean).join(", ")}
              </span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
              {lead.phone}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <Users
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-[10px] leading-none text-muted-foreground">
                Interactions
              </span>
              <span className="text-xs font-medium tabular-nums">
                {lead.interactionCount}
              </span>
            </span>
          </span>
          <span className="h-6 w-px bg-border" />
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-[10px] leading-none text-muted-foreground">
                Last contact
              </span>
              <span
                className={cn(
                  "block truncate text-xs font-medium",
                  lead.needsFollowUp && "text-rose-700 dark:text-rose-400",
                )}
              >
                {relativeContact(lead)}
              </span>
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </Card>
    </Link>
  );
}

function LeadCard({
  lead,
  tone,
}: {
  lead: LeadListRow;
  tone: keyof typeof ROW_TONE;
}) {
  return (
    <Link href={`/leads/${leadRef(lead)}`}>
      <Card className={cn("cursor-pointer p-4 transition-colors", ROW_TONE[tone])}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {/* Who */}
          <div className="min-w-0 sm:flex-1">
            <p className="truncate font-semibold">{lead.businessName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {lead.ownerName} · {lead.city}
            </p>
          </div>

          {/* Contact, stage, trail */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:shrink-0">
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" aria-hidden="true" />
              {lead.phone}
            </span>
            <Badge variant="outline" className="font-normal">
              {STAGE_LABEL[lead.stage]}
            </Badge>
            <span className="tabular-nums">
              {lead.interactionCount} interaction
              {lead.interactionCount === 1 ? "" : "s"}
            </span>
            <Badge
              variant="outline"
              className={cn("shrink-0", BAND_TONE[lead.trailBand])}
            >
              {lead.trailStrength}
            </Badge>
          </div>
        </div>

        {/* Status line, one row, so row heights stay even down the list. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {lead.isRelatedParty ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Known contact — reviewed more closely
            </span>
          ) : null}
          {lead.needsFollowUp ? (
            <span className="flex items-center gap-1.5 text-rose-700">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              No contact for {lead.silentDays} days
            </span>
          ) : lead.lastInteractionDate ? (
            <span className="text-muted-foreground">
              Last contact {formatDate(lead.lastInteractionDate)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Nothing logged yet — go back and log the visit
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

export default function LeadsList() {
  const { viewingId: seasonId } = useSeason();
  const controls = useLeadsControl();
  const [capturing, setCapturing] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>("all");

  const leads = useQuery({
    queryKey: leadKeys.list(seasonId),
    queryFn: () => listLeads(),
  });
  const status = useQuery({
    queryKey: leadKeys.status(seasonId),
    queryFn: () => getPipelineStatus(),
  });

  const rows = leads.data ?? [];
  const open = rows.filter((l) => OPEN_STAGES.includes(l.stage));
  const closed = rows.filter((l) => !OPEN_STAGES.includes(l.stage));
  const showOpen = filter !== "closed";
  const showClosed = filter !== "open";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <LeadsLockBanner />
      <div
        className="hidden flex-wrap items-start justify-between gap-3 lg:flex"
        data-tour="student-pipeline"
      >
        <div className="mobile-page-heading">
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Every project starts as a client you actually met.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Only worth showing once there is something to filter. */}
          {rows.length > 0 ? (
            <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
              {(
                [
                  ["all", "All", rows.length],
                  ["open", "Working on", open.length],
                  ["closed", "Closed", closed.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`filter-leads-${key}`}
                >
                  {label}
                  <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
                </button>
              ))}
            </div>
          ) : null}
          {controls.can("leads", "add") ? (
            <Button onClick={() => setCapturing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Log a client
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Phone header: title, then ONE compact row of tabs + action ──── */}
      <div className="space-y-3 lg:hidden">
        {/* Hidden inside the installed app, where the app bar is the title. */}
        <div className="mobile-page-heading">
          <h1 className="text-2xl font-bold">Leads</h1>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 ? (
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl border bg-muted/40 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["all", "All", rows.length],
                  ["open", "Working on", open.length],
                  ["closed", "Closed", closed.length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                    filter === key
                      ? "bg-sidebar text-sidebar-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                  data-testid={`filter-leads-mobile-${key}`}
                >
                  {label}
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </button>
              ))}
            </div>
          ) : (
            <span className="flex-1" />
          )}
          {controls.can("leads", "add") ? (
            <Button
              size="sm"
              className="h-9 shrink-0 whitespace-nowrap px-3 text-xs"
              onClick={() => setCapturing(true)}
              data-testid="button-log-client-mobile"
            >
              <Plus className="mr-1 h-4 w-4" />
              Log a client
            </Button>
          ) : null}
        </div>
      </div>

      {status.data ? (
        <>
          <Card className="hidden p-5 lg:block">
            <PipelineStepper status={status.data} />
          </Card>
          {/* One strip, five steps, no instructional prose. */}
          <Card className="px-2 py-3 lg:hidden">
            <PipelineStepper status={status.data} compact />
          </Card>
        </>
      ) : null}

      {leads.isLoading ? (
        <>
          {/* In the app, show the shape of what is arriving. ListSkeleton
              renders null on web, so the spinner below stays the browser's
              behaviour and nothing familiar changes there. */}
          <ListSkeleton />
          {!isNativeApp() && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}
        </>
      ) : leads.isError ? (
        <Card className="flex items-center gap-3 p-6 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          {/* The server refuses pipeline calls from an earlier season. The
              route redirects before this normally shows, but a season switched
              in another tab can land here — say why rather than "try again",
              which would never work. */}
          {(leads.error as { data?: { code?: string } } | undefined)?.data
            ?.code === "SEASON_NOT_SUPPORTED"
            ? "Leads are part of Season 2. Switch to Season 2 to use them."
            : "Could not load your leads. Refresh and try again."}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-medium">No leads yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Go and talk to a business near your campus, then log what they said
            while it is still fresh.
          </p>
          {controls.can("leads", "add") ? (
            <Button className="mt-4" onClick={() => setCapturing(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Log your first client
            </Button>
          ) : null}
        </Card>
      ) : (
        <>
        {/* ── Phone: sections of compact cards ──────────────────────────── */}
        <div className="space-y-7 lg:hidden">
          {showOpen && open.length > 0 ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  Working on ({open.length})
                </h2>
                {filter === "all" ? (
                  <button
                    type="button"
                    onClick={() => setFilter("open")}
                    className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary"
                    data-testid="view-all-open"
                  >
                    View all
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="space-y-3">
                {open.map((l) => (
                  <MobileLeadCard key={l.id} lead={l} tone="open" />
                ))}
              </div>
            </section>
          ) : null}

          {showOpen && open.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing open right now.
            </p>
          ) : null}

          {showClosed && closed.length > 0 ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  Closed ({closed.length})
                </h2>
                {filter === "all" ? (
                  <button
                    type="button"
                    onClick={() => setFilter("closed")}
                    className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary"
                    data-testid="view-all-closed"
                  >
                    View all
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <div className="space-y-3">
                {closed.map((l) => (
                  <MobileLeadCard key={l.id} lead={l} tone="closed" />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* ── Desktop: the full-width rows, unchanged ───────────────────── */}
        <div className="hidden space-y-6 lg:block">
          {showOpen ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Working on ({open.length})
              </h2>
              <div className="space-y-2.5">
                {open.map((l) => (
                  <LeadCard key={l.id} lead={l} tone="open" />
                ))}
              </div>
              {open.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing open right now.
                </p>
              ) : null}
            </section>
          ) : null}

          {showClosed && closed.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Closed ({closed.length})
              </h2>
              <div className="space-y-2.5">
                {closed.map((l) => (
                  <LeadCard key={l.id} lead={l} tone="closed" />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        </>
      )}

      <CaptureDialog open={capturing} onOpenChange={setCapturing} />
    </div>
  );
}
