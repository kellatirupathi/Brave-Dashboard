// Season 2 — Stage 1: the lead board, plus the capture form.
//
// Replaces "Projects" in the Season 2 sidebar. Season 1 keeps its own Projects
// page untouched; this route is additive and only reachable while Season 2 is
// the season being viewed.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Plus,
  MapPin,
  Phone,
  AlertTriangle,
  Clock,
  ShieldAlert,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import { PipelineStepper } from "@/components/pipeline-stepper";
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
  const [form, setForm] = useState<CreateLeadBody>(EMPTY);
  const [geoBusy, setGeoBusy] = useState(false);

  const set = <K extends keyof CreateLeadBody>(
    k: K,
    v: CreateLeadBody[K],
  ): void => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => createLead(form),
    onSuccess: (res) => {
      successFeedback();
      void qc.invalidateQueries({ queryKey: leadKeys.list(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          <Field
            label="What did they say?"
            required
            hint="Their words, not a summary. This is the strongest part of your trail."
          >
            <Textarea
              rows={4}
              value={form.conversationNote}
              onChange={(e) => set("conversationNote", e.target.value)}
            />
          </Field>

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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadCard({ lead }: { lead: LeadListRow }) {
  return (
    <Link href={`/leads/${lead.id}`}>
      <Card className="cursor-pointer p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{lead.businessName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {lead.ownerName} · {lead.city}
            </p>
          </div>
          <Badge variant="outline" className={cn("shrink-0", BAND_TONE[lead.trailBand])}>
            {lead.trailStrength}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" aria-hidden="true" />
            {lead.phone}
          </span>
          <span>{STAGE_LABEL[lead.stage]}</span>
          <span>
            {lead.interactionCount} interaction
            {lead.interactionCount === 1 ? "" : "s"}
          </span>
        </div>

        {lead.isRelatedParty ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Known contact — reviewed more closely
          </p>
        ) : null}

        {lead.needsFollowUp ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-700">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            No contact for {lead.silentDays} days
          </p>
        ) : lead.lastInteractionDate ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Last contact {formatDate(lead.lastInteractionDate)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Nothing logged yet — go back and log the visit
          </p>
        )}
      </Card>
    </Link>
  );
}

export default function LeadsList() {
  const { viewingId: seasonId } = useSeason();
  const [capturing, setCapturing] = useState(false);

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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Every project starts as a client you actually met.
          </p>
        </div>
        <Button onClick={() => setCapturing(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Log a client
        </Button>
      </div>

      {status.data ? (
        <Card className="p-5">
          <PipelineStepper status={status.data} />
        </Card>
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
          <Button className="mt-4" onClick={() => setCapturing(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Log your first client
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Working on ({open.length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((l) => (
                <LeadCard key={l.id} lead={l} />
              ))}
            </div>
            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing open right now.
              </p>
            ) : null}
          </section>

          {closed.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Closed ({closed.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {closed.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <CaptureDialog open={capturing} onOpenChange={setCapturing} />
    </div>
  );
}
