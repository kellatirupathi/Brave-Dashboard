// Season 2 — Stage 2: work the lead.
//
// The whole point of this screen is the interaction trail. Gate A (3 dated
// interactions spanning 7+ days) is what unlocks conversion, so the trail is
// the primary object here and everything else is context around it.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  CircleDashed,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate, formatINR } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import {
  getLead,
  leadKeys,
  logInteraction,
  moveStage,
  STAGE_LABEL,
  type LogInteractionBody,
  type TrailBand,
} from "@/lib/leads-api";

const TYPES = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "site_visit", label: "Visited them" },
  { value: "demo", label: "Showed a demo" },
  { value: "proposal_sent", label: "Sent a proposal" },
  { value: "negotiation", label: "Negotiated" },
  { value: "payment_discussion", label: "Discussed payment" },
] as const;

const OUTCOMES = [
  { value: "positive", label: "Went well" },
  { value: "neutral", label: "Neutral" },
  { value: "objection", label: "They objected" },
  { value: "no_response", label: "No response" },
] as const;

const BAND_TONE: Record<TrailBand, string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  weak: "bg-rose-100 text-rose-800 border-rose-200",
};

const BAND_LABEL: Record<TrailBand, string> = {
  strong: "Strong trail",
  moderate: "Moderate trail",
  weak: "Weak trail",
};

const SOURCE_LABEL: Record<string, string> = {
  walk_in: "Walked in",
  online: "Found online",
  referral: "Referral",
  known_contact: "Known contact",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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

const EMPTY: LogInteractionBody = {
  interactionDate: todayIso(),
  interactionType: "",
  summary: "",
  outcome: "",
};

function LogDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { viewingId: seasonId } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<LogInteractionBody>(EMPTY);

  const set = <K extends keyof LogInteractionBody>(
    k: K,
    v: LogInteractionBody[K],
  ): void => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => logInteraction(leadId, form),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: leadKeys.detail(seasonId, leadId) });
      void qc.invalidateQueries({ queryKey: leadKeys.list(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      onOpenChange(false);
      setForm(EMPTY);
      // The interaction is always saved, even when a bundled stage move was
      // refused — so say both things, and never imply the typing was lost.
      if (res.stageRefused) {
        toast({
          title: "Interaction saved — stage not changed yet",
          description: res.stageRefused.reasons.join(" "),
        });
      } else {
        toast({
          title: "Interaction saved",
          description: `Trail strength is now ${res.trailStrength}.`,
        });
      }
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save the interaction",
        description: err.message,
        variant: "destructive",
      }),
  });

  const canSubmit =
    !!form.interactionDate &&
    !!form.interactionType &&
    !!form.summary.trim() &&
    !!form.outcome;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log an interaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              When did this happen?<span className="ml-0.5 text-destructive">*</span>
            </span>
            <Input
              type="date"
              max={todayIso()}
              value={form.interactionDate}
              onChange={(e) => set("interactionDate", e.target.value)}
            />
            <span className="block text-xs text-muted-foreground">
              Use the real date. Reviewers can see the gap between when it
              happened and when you wrote it down.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              What did you do?<span className="ml-0.5 text-destructive">*</span>
            </span>
            <Select
              value={form.interactionType}
              onChange={(v) => set("interactionType", v)}
              options={TYPES}
              placeholder="Choose one"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              What was said?<span className="ml-0.5 text-destructive">*</span>
            </span>
            <Textarea
              rows={4}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              How did it go?<span className="ml-0.5 text-destructive">*</span>
            </span>
            <Select
              value={form.outcome}
              onChange={(v) => set("outcome", v)}
              options={OUTCOMES}
              placeholder="Choose one"
            />
          </label>

          {form.outcome === "objection" ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">What did they object to?</span>
              <Textarea
                rows={2}
                value={form.objectionNote ?? ""}
                onChange={(e) => set("objectionNote", e.target.value)}
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What will you do next?</span>
            <Input
              type="date"
              value={form.nextActionDate ?? ""}
              onChange={(e) => set("nextActionDate", e.target.value)}
            />
            <span className="block text-xs text-muted-foreground">
              Setting a date stops this lead drifting into the follow-up list.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadDetail() {
  const params = useParams<{ id: string }>();
  const leadId = Number(params.id);
  const { viewingId: seasonId, canWrite } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [logging, setLogging] = useState(false);

  const q = useQuery({
    queryKey: leadKeys.detail(seasonId, leadId),
    queryFn: () => getLead(leadId),
    enabled: Number.isInteger(leadId) && leadId > 0,
  });

  const convert = useMutation({
    mutationFn: () => moveStage(leadId, "converted"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leadKeys.detail(seasonId, leadId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      toast({
        title: "Converted",
        description: "Now describe what you are building for them.",
      });
      navigate(`/leads/${leadId}/project`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not convert this lead",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm">
          Could not load this lead.{" "}
          <Link href="/leads" className="underline">
            Back to leads
          </Link>
        </Card>
      </div>
    );
  }

  const { lead, interactions, gateA, trailBand, canConvert } = q.data;
  const writable = canWrite("project");

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link href="/leads">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Leads
        </Button>
      </Link>

      {/* ── Client ─────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{lead.businessName}</h1>
            <p className="text-sm text-muted-foreground">
              {lead.ownerName} · {lead.phone} · {lead.city}
              {lead.areaLocality ? `, ${lead.areaLocality}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{STAGE_LABEL[lead.stage]}</Badge>
            <Badge variant="outline" className={BAND_TONE[trailBand]}>
              {BAND_LABEL[trailBand]} · {lead.trailStrength}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">How you met</p>
            <p>{SOURCE_LABEL[lead.source] ?? lead.source}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">First meeting</p>
            <p>{formatDate(lead.firstMeetingDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated value</p>
            <p>
              {lead.estimatedValue != null
                ? formatINR(lead.estimatedValue)
                : "Not estimated"}
            </p>
          </div>
        </div>

        {lead.geoLat ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Location captured at the client's premises
          </p>
        ) : null}

        {lead.isRelatedParty ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Known contact</p>
              <p className="text-xs">
                {lead.relationshipNote ??
                  lead.referrerName ??
                  "This client is someone you already knew."}{" "}
                That is allowed — it is just reviewed more closely, so keep your
                evidence strong.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-md bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            What they said at the first meeting
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {lead.conversationNote}
          </p>
          {lead.painPoint ? (
            <>
              <p className="mt-3 text-xs font-medium text-muted-foreground">
                Their problem
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{lead.painPoint}</p>
            </>
          ) : null}
        </div>
      </Card>

      {/* ── Gate A ─────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {gateA.passed ? (
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                aria-hidden="true"
              />
            ) : (
              <CircleDashed
                className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <div>
              <p className="font-semibold">
                {gateA.passed
                  ? "Ready to convert"
                  : "Not ready to convert yet"}
              </p>
              {gateA.reasons.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {gateA.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Your trail is strong enough. Convert when the client has said
                  yes.
                </p>
              )}
            </div>
          </div>
          {lead.stage === "converted" ? (
            <Link href={`/leads/${lead.id}/project`}>
              <Button>Open the project</Button>
            </Link>
          ) : (
            <Button
              disabled={!canConvert || !writable || convert.isPending}
              onClick={() => convert.mutate()}
            >
              {convert.isPending ? "Converting…" : "Client said yes"}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Trail ──────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">
            Interactions ({interactions.length})
          </h2>
          {writable ? (
            <Button size="sm" onClick={() => setLogging(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Log an interaction
            </Button>
          ) : null}
        </div>

        {interactions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nothing logged yet. Every follow-up you record here is what makes
            this client credible.
          </Card>
        ) : (
          <div className="space-y-3">
            {interactions.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {TYPES.find((t) => t.value === i.interactionType)?.label ??
                        i.interactionType}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(i.interactionDate)}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      i.outcome === "positive" &&
                        "border-emerald-200 bg-emerald-50 text-emerald-800",
                      i.outcome === "objection" &&
                        "border-amber-200 bg-amber-50 text-amber-800",
                      i.outcome === "no_response" &&
                        "border-rose-200 bg-rose-50 text-rose-800",
                    )}
                  >
                    {OUTCOMES.find((o) => o.value === i.outcome)?.label ??
                      i.outcome}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{i.summary}</p>
                {i.objectionNote ? (
                  <p className="mt-2 text-sm text-amber-800">
                    Objection: {i.objectionNote}
                  </p>
                ) : null}
                {i.stageChange ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Moved to {STAGE_LABEL[i.stageChange]}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>

      <LogDialog leadId={leadId} open={logging} onOpenChange={setLogging} />
    </div>
  );
}
