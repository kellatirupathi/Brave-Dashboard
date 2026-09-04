// Admin → Programme → Leads (additive, isolated, read-only).
//
// Every lead from every team in the viewed season, one row each, with the
// derived state an admin needs to track it from capture to BRD: trail
// strength, Gate A, project, payments received, and where the BRD stands.
// Filters and sorting are server-side so they span every page; clicking a row
// opens the full record (trail, project, phases, payments, composed BRD and
// its Gate C checklist) in a side sheet.
//
// Deleting this page means removing its route in App.tsx, its sidebar entry
// under Programme, and the "/admin/leads" key in the two admin-permission
// registries. Nothing else references it.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListCampuses } from "@workspace/api-client-react";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  MoreVertical,
  Download,
  Handshake,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Paperclip,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import { useSeason } from "@/lib/season-context";
import { useAdminPageAccess } from "@/lib/admin-access";
import { STAGE_LABEL, LEAD_STAGES, type LeadStage } from "@/lib/leads-api";
import {
  listAdminLeads,
  getAdminLead,
  adminLeadKeys,
  adminLeadsQueryString,
  BRD_STATUSES,
  BRD_STATUS_LABEL,
  LEAD_SOURCES,
  SOURCE_LABEL,
  PIPELINE_STEP_LABEL,
  type AdminLeadRow,
  type AdminLeadsQuery,
  type AdminLeadsSortKey,
  type BrdStatus,
} from "@/lib/admin-leads-api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageSizeSelect } from "@/components/page-size-select";

const PAGE_SIZE = 100;
const ALL = "all";

// Columns that default to descending on first click (largest / newest first).
const NUMERIC_SORT_KEYS = new Set<AdminLeadsSortKey>([
  "trail",
  "interactions",
  "lastContact",
  "estimatedValue",
  "received",
  "brd",
  "step",
  "created",
]);

// ── Small presentational pieces ─────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: AdminLeadsSortKey;
  activeKey: AdminLeadsSortKey;
  dir: "asc" | "desc";
  onSort: (k: AdminLeadsSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 select-none whitespace-nowrap hover:opacity-80 transition-opacity",
          active && "font-semibold",
        )}
        data-testid={`sort-leads-${sortKey}`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

const STAGE_TONE: Record<LeadStage, string> = {
  new: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  qualified: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  proposal_sent: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  converted: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  lost: "bg-rose-100 text-rose-700 hover:bg-rose-100",
  dormant: "bg-amber-100 text-amber-800 hover:bg-amber-100",
};

function StageBadge({ stage }: { stage: LeadStage }) {
  return (
    <Badge className={cn("font-medium", STAGE_TONE[stage])}>
      {STAGE_LABEL[stage] ?? stage}
    </Badge>
  );
}

const BRD_TONE: Record<BrdStatus, string> = {
  no_project: "bg-muted text-muted-foreground hover:bg-muted",
  awaiting_payment: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  in_progress: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ready: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  submitted: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  verified: "bg-emerald-600 text-white hover:bg-emerald-600",
  rejected: "bg-rose-600 text-white hover:bg-rose-600",
  revoked: "bg-rose-100 text-rose-700 hover:bg-rose-100",
};

function BrdBadge({ status }: { status: BrdStatus }) {
  return (
    <Badge className={cn("font-medium whitespace-nowrap", BRD_TONE[status])}>
      {BRD_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const TRAIL_TONE: Record<string, string> = {
  strong: "text-emerald-700",
  moderate: "text-amber-700",
  weak: "text-rose-700",
};

function TrailCell({ strength, band }: { strength: number; band: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            band === "strong"
              ? "bg-emerald-500"
              : band === "moderate"
                ? "bg-amber-500"
                : "bg-rose-500",
          )}
          style={{ width: `${Math.max(0, Math.min(100, strength))}%` }}
        />
      </span>
      <span
        className={cn("text-xs font-medium tabular-nums", TRAIL_TONE[band])}
      >
        {strength}
      </span>
    </div>
  );
}

function GateACell({
  gateA,
}: {
  gateA: AdminLeadRow["gateA"];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-xs">
          {gateA.passed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="tabular-nums text-muted-foreground">
            {gateA.interactionCount}d · {gateA.spanDays}d
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {gateA.passed
          ? "Gate A passed — this lead may be qualified or converted."
          : gateA.reasons.join(" ")}
      </TooltipContent>
    </Tooltip>
  );
}

function StepDots({ step }: { step: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={cn(
                "h-2 w-2 rounded-full",
                n <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Step {step} of 5 — {PIPELINE_STEP_LABEL[step]}
      </TooltipContent>
    </Tooltip>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "bad" && "text-rose-700",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  );
}

function CampusFilterPopover({
  value,
  campuses,
  onChange,
  fullWidth = false,
}: {
  value: string;
  campuses: { id: number; name: string }[];
  onChange: (next: string) => void;
  /** Stretch to the container (used inside the Filters panel). */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    value === ALL
      ? "All campuses"
      : (campuses.find((c) => String(c.id) === value)?.name ?? "All campuses");
  const sorted = [...campuses].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            fullWidth ? "w-full" : "sm:w-52",
            "justify-between font-normal",
          )}
          data-testid="select-leads-campus-filter"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search campuses…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No campus found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All campuses"
                onSelect={() => {
                  onChange(ALL);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === ALL ? "opacity-100" : "opacity-0",
                  )}
                />
                All campuses
              </CommandItem>
              {sorted.map((c) => {
                const v = String(c.id);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === v ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {c.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TeamFilterPopover({
  value,
  teams,
  onChange,
  fullWidth = false,
}: {
  value: string;
  teams: { id: number; name: string }[];
  onChange: (next: string) => void;
  /** Stretch to the container (used inside the Filters panel). */
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    value === ALL
      ? "All teams"
      : (teams.find((t) => String(t.id) === value)?.name ?? "All teams");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            fullWidth ? "w-full" : "sm:w-48",
            "justify-between font-normal",
          )}
          data-testid="select-leads-team-filter"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search teams…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No team found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All teams"
                onSelect={() => {
                  onChange(ALL);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === ALL ? "opacity-100" : "opacity-0",
                  )}
                />
                All teams
              </CommandItem>
              {teams.map((t) => {
                const v = String(t.id);
                return (
                  <CommandItem
                    key={t.id}
                    value={`${t.name} ${t.id}`}
                    onSelect={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === v ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {t.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Detail sheet ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm break-words">{children ?? "—"}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
  );
}

function DocLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={resolveStoredObjectUrl(href)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function LeadDetailSheet({
  leadId,
  seasonId,
  onClose,
}: {
  leadId: number | null;
  seasonId: number | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const q = useQuery({
    queryKey: adminLeadKeys.detail(seasonId, leadId),
    queryFn: () => getAdminLead(leadId as number),
    enabled: leadId != null,
  });
  const d = q.data;
  const lead = d?.lead;

  return (
    <Sheet open={leadId != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {q.isLoading || !d || !lead ? (
          <div className="flex h-64 items-center justify-center">
            {q.isError ? (
              <p className="text-sm text-destructive">
                Could not load this lead.
              </p>
            ) : (
              <Spinner size="lg" />
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <StageBadge stage={lead.stage} />
                <BrdBadge status={lead.brdStatus} />
                {lead.isRelatedParty ? (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-800"
                  >
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    Related party
                  </Badge>
                ) : null}
                {d.duplicateTeams.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-rose-300 bg-rose-50 text-rose-800"
                  >
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Also claimed by {d.duplicateTeams.length} other team
                    {d.duplicateTeams.length === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>
              <SheetTitle className="text-2xl">{lead.businessName}</SheetTitle>
              <SheetDescription>
                {lead.ownerName} · {lead.phone}
                {lead.altPhone ? ` / ${lead.altPhone}` : ""} · {lead.city}
                {lead.areaLocality ? `, ${lead.areaLocality}` : ""}
              </SheetDescription>
              <div className="flex items-center gap-2 pt-1">
                <StepDots step={lead.pipelineStep} />
                <span className="text-xs text-muted-foreground">
                  Step {lead.pipelineStep} of 5 ·{" "}
                  {PIPELINE_STEP_LABEL[lead.pipelineStep]}
                </span>
              </div>
            </SheetHeader>

            {/* Team */}
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SectionTitle>Team</SectionTitle>
                  <p className="mt-1 text-sm">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setLocation(`/admin/teams/${lead.teamId}`)}
                    >
                      {lead.teamName}
                    </button>
                    <span className="text-muted-foreground">
                      {" "}
                      · {lead.campusName ?? "No campus"}
                    </span>
                  </p>
                </div>
              </div>
              {d.team?.members.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {d.team.members.map((m) => (
                    <li
                      key={m.userId}
                      className="rounded-md border px-2 py-1 text-xs"
                    >
                      {m.name || m.email || m.userId}
                      {m.niatId ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {m.niatId}
                        </span>
                      ) : null}
                      {m.isLeader ? (
                        <span className="ml-1 font-medium text-primary">
                          Leader
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.duplicateTeams.length > 0 ? (
                <p className="mt-3 text-xs text-rose-700">
                  Same client phone logged by:{" "}
                  {d.duplicateTeams
                    .map((t) => `${t.name}${t.campusName ? ` (${t.campusName})` : ""}`)
                    .join(", ")}
                </p>
              ) : null}
            </Card>

            {/* Capture */}
            <Card className="space-y-4 p-4">
              <SectionTitle>1 · Capture</SectionTitle>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Field label="How they met">
                  {SOURCE_LABEL[lead.source as keyof typeof SOURCE_LABEL] ??
                    lead.source}
                </Field>
                <Field label="First meeting">
                  {formatDate(lead.firstMeetingDate)}
                </Field>
                <Field label="Meeting mode">
                  {lead.meetingMode.replace(/_/g, " ")}
                </Field>
                <Field label="Category">
                  {lead.businessCategory.replace(/_/g, " ")}
                </Field>
                <Field label="Estimated value">
                  {lead.estimatedValue != null
                    ? formatINR(lead.estimatedValue)
                    : "—"}
                </Field>
                <Field label="Location">
                  {lead.geoCaptured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <MapPin className="h-3.5 w-3.5" />
                      Captured on site
                      {d.raw.geoLat && d.raw.geoLng ? (
                        <a
                          className="ml-1 text-primary hover:underline"
                          href={`https://maps.google.com/?q=${d.raw.geoLat},${d.raw.geoLng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          map
                        </a>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not captured</span>
                  )}
                </Field>
                {lead.referrerName ? (
                  <Field label="Referred by">{lead.referrerName}</Field>
                ) : null}
                {lead.relationshipNote ? (
                  <Field label="Relationship">{lead.relationshipNote}</Field>
                ) : null}
                <Field label="Captured">
                  {formatDateTime(lead.createdAt)}
                </Field>
              </div>
              <Separator />
              <Field label="What they said at the first meeting">
                <p className="whitespace-pre-wrap">{lead.conversationNote}</p>
              </Field>
              {lead.painPoint ? (
                <Field label="Their problem">
                  <p className="whitespace-pre-wrap">{lead.painPoint}</p>
                </Field>
              ) : null}
              {Array.isArray(d.raw.evidence) && d.raw.evidence.length > 0 ? (
                <Field label="Evidence">
                  <ul className="flex flex-wrap gap-2">
                    {(d.raw.evidence as unknown[]).map((e, i) => {
                      const href =
                        typeof e === "string"
                          ? e
                          : ((e as { url?: string })?.url ?? null);
                      return (
                        <li key={i}>
                          <DocLink href={href} label={`File ${i + 1}`} />
                        </li>
                      );
                    })}
                  </ul>
                </Field>
              ) : null}
            </Card>

            {/* Trail */}
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>
                  2 · Trail ({d.interactions.length} interaction
                  {d.interactions.length === 1 ? "" : "s"})
                </SectionTitle>
                <div className="flex items-center gap-3">
                  <TrailCell
                    strength={lead.trailStrength}
                    band={lead.trailBand}
                  />
                  <GateACell gateA={lead.gateA} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Gate A: {lead.gateA.passed ? "passed" : lead.gateA.reasons.join(" ")}
                {lead.silentDays != null
                  ? ` · Last contact ${lead.silentDays} day${lead.silentDays === 1 ? "" : "s"} ago`
                  : ""}
                {lead.nextActionDate
                  ? ` · Next action ${formatDate(lead.nextActionDate)}`
                  : ""}
              </p>
              {d.interactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing logged yet.
                </p>
              ) : (
                <ol className="divide-y">
                  {d.interactions.map((it) => {
                    const hasFiles =
                      Array.isArray(it.attachments) && it.attachments.length > 0;
                    const loggedAfterH = Math.round(
                      (Date.parse(it.loggedAt) -
                        Date.parse(`${it.interactionDate}T00:00:00Z`)) /
                        3_600_000,
                    );
                    return (
                      <li key={it.id} className="py-2.5 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium tabular-nums">
                            {formatDate(it.interactionDate)}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {it.interactionType.replace(/_/g, " ")}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              it.outcome === "positive" &&
                                "border-emerald-300 text-emerald-700",
                              it.outcome === "objection" &&
                                "border-rose-300 text-rose-700",
                            )}
                          >
                            {it.outcome.replace(/_/g, " ")}
                          </Badge>
                          {it.stageChange ? (
                            <Badge variant="secondary">
                              → {STAGE_LABEL[it.stageChange]}
                            </Badge>
                          ) : null}
                          {hasFiles ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {it.attachments!.length}
                            </span>
                          ) : null}
                          {loggedAfterH > 72 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                                  <AlertTriangle className="h-3 w-3" />
                                  logged {Math.round(loggedAfterH / 24)}d later
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Written up well after the date claimed — the
                                backdating signal.
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{it.summary}</p>
                        {it.objectionNote ? (
                          <p className="mt-1 text-xs text-rose-700">
                            Objection: {it.objectionNote}
                          </p>
                        ) : null}
                        {hasFiles ? (
                          <ul className="mt-1 flex flex-wrap gap-2">
                            {it.attachments!.map((a, i) => (
                              <li key={i}>
                                <DocLink href={a} label={`Attachment ${i + 1}`} />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            {/* Project */}
            <Card className="space-y-4 p-4">
              <SectionTitle>3 · Project</SectionTitle>
              {!d.project ? (
                <p className="text-sm text-muted-foreground">
                  {lead.stage === "converted"
                    ? "Converted — the team has not opened a project yet."
                    : "No project. A project can only start from a Converted lead (Gate B)."}
                </p>
              ) : (
                <>
                  <div>
                    <button
                      type="button"
                      className="text-base font-semibold text-primary hover:underline"
                      onClick={() => setLocation(`/admin/projects/${d.project!.id}`)}
                    >
                      {d.project.title}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Opened {formatDateTime(d.project.createdAt)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Field label="Service category">
                      {d.project.serviceCategory ?? "—"}
                    </Field>
                    <Field label="Revenue type">
                      {d.project.revenueType
                        ? `${d.project.revenueType.replace(/_/g, " ")}${
                            d.project.recurringFrequency
                              ? ` · ${d.project.recurringFrequency}`
                              : ""
                          }`
                        : "—"}
                    </Field>
                    <Field label="Contract value">
                      {d.project.totalContractValue != null
                        ? formatINR(d.project.totalContractValue)
                        : "—"}
                    </Field>
                    <Field label="Live product">
                      <DocLink href={d.project.liveProductUrl} label="Open" />
                    </Field>
                    <Field label="Demo video">
                      <DocLink href={d.project.demoVideoUrl} label="Open" />
                    </Field>
                    <Field label="Source code">
                      <DocLink href={d.project.sourceCodeUrl} label="Open" />
                    </Field>
                    <Field label="Prototype">
                      <DocLink href={d.project.prototypeUrl} label="Open" />
                    </Field>
                    <Field label="Agreement">
                      <DocLink href={d.project.agreementDoc} label="Open" />
                    </Field>
                    <Field label="Demo credentials">
                      {d.project.demoCredentials ?? "—"}
                    </Field>
                  </div>
                  {d.project.problemStatement ? (
                    <Field label="Problem statement">
                      <p className="whitespace-pre-wrap">
                        {d.project.problemStatement}
                      </p>
                    </Field>
                  ) : null}
                  {d.project.solutionDescription ? (
                    <Field label="Solution">
                      <p className="whitespace-pre-wrap">
                        {d.project.solutionDescription}
                      </p>
                    </Field>
                  ) : null}
                  {d.project.adminNotes ? (
                    <Field label="Admin notes">
                      <p className="whitespace-pre-wrap">{d.project.adminNotes}</p>
                    </Field>
                  ) : null}

                  <Separator />
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Phases ({d.project.phases.length})
                  </p>
                  {d.project.phases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No phases defined (2 minimum required).
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phase</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead className="text-right">Scheduled</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead className="text-right">Received</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {d.project.phases.map((ph) => (
                            <TableRow key={ph.id}>
                              <TableCell>
                                <div className="font-medium">{ph.name}</div>
                                {ph.deliverables ? (
                                  <div className="text-xs text-muted-foreground">
                                    {ph.deliverables}
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {ph.startDate ? formatDate(ph.startDate) : "—"} →{" "}
                                {ph.endDate ? formatDate(ph.endDate) : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {ph.scheduledAmount != null
                                  ? formatINR(ph.scheduledAmount)
                                  : "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {ph.dueDate ? formatDate(ph.dueDate) : "—"}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "text-right tabular-nums",
                                  ph.scheduledAmount != null &&
                                    ph.receivedAmount >= ph.scheduledAmount &&
                                    ph.receivedAmount > 0 &&
                                    "text-emerald-700 font-medium",
                                )}
                              >
                                {formatINR(ph.receivedAmount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* Payments */}
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <SectionTitle>
                  4 · Payments ({d.project?.payments.length ?? 0})
                </SectionTitle>
                <span className="text-sm font-semibold tabular-nums">
                  {formatINR(lead.payments.received)} received
                </span>
              </div>
              {!d.project || d.project.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payment recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Phase</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Mode / ref</TableHead>
                        <TableHead>Proof</TableHead>
                        <TableHead>Client</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.project.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(p.paymentDate)}
                          </TableCell>
                          <TableCell>{p.phaseName}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatINR(p.amountReceived)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="capitalize">
                              {p.paymentMode.replace(/_/g, " ")}
                            </span>
                            {p.transactionRef ? (
                              <div className="font-mono text-muted-foreground">
                                {p.transactionRef}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-0.5">
                              <DocLink href={p.paymentProof} label="Payment proof" />
                              {p.invoiceDoc ? (
                                <DocLink href={p.invoiceDoc} label="Invoice" />
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {p.clientConfirmed ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Confirmed
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Not yet
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            {/* BRD */}
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>5 · BRD</SectionTitle>
                <BrdBadge status={lead.brdStatus} />
              </div>
              {d.revenueEntry ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Field label="Claimed">
                    {formatINR(d.revenueEntry.amount)}
                  </Field>
                  <Field label="Recognised">
                    {d.revenueEntry.recognisedAmount != null
                      ? formatINR(d.revenueEntry.recognisedAmount)
                      : "—"}
                  </Field>
                  <Field label="Verified">
                    {d.revenueEntry.verifiedAmount != null
                      ? formatINR(d.revenueEntry.verifiedAmount)
                      : "—"}
                  </Field>
                  <Field label="Submitted">
                    {d.revenueEntry.submittedAt
                      ? formatDateTime(d.revenueEntry.submittedAt)
                      : "—"}
                  </Field>
                  {d.revenueEntry.adminNotes ? (
                    <div className="col-span-full">
                      <Field label="Reviewer notes">
                        <p className="whitespace-pre-wrap">
                          {d.revenueEntry.adminNotes}
                        </p>
                      </Field>
                    </div>
                  ) : null}
                  <div className="col-span-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/admin/queue")}
                    >
                      Open in Review Queue
                    </Button>
                  </div>
                </div>
              ) : null}

              {d.brd ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Gate C checklist —{" "}
                    {d.brd.gateC.passed
                      ? "all clear"
                      : `${d.brd.gateC.remaining} remaining`}
                  </p>
                  <ul className="space-y-1.5">
                    {d.brd.gateC.items.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-start gap-2 text-sm"
                      >
                        {item.passed ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        )}
                        <div>
                          <span>{item.label}</span>
                          {!item.passed && item.detail ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {item.detail}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : !d.project ? (
                <p className="text-sm text-muted-foreground">
                  The BRD is composed automatically once a project exists and
                  payments are logged. Nothing to compose yet.
                </p>
              ) : null}

              {d.revenueEntry?.brdText ? (
                <details className="rounded-md border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Generated BRD (as submitted)
                  </summary>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                    {d.revenueEntry.brdText}
                  </pre>
                </details>
              ) : null}
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Filters ─────────────────────────────────────────────────────────────────

type Filters = {
  campus: string;
  team: string;
  stage: string;
  source: string;
  trail: string;
  brd: string;
  gateA: string;
  flag: string;
};

const EMPTY_FILTERS: Filters = {
  campus: ALL,
  team: ALL,
  stage: ALL,
  source: ALL,
  trail: ALL,
  brd: ALL,
  gateA: ALL,
  flag: ALL,
};

function countActive(f: Filters): number {
  return Object.values(f).filter((v) => v !== ALL).length;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * All filters in a right-hand panel. Edits are DRAFTED locally and only reach
 * the table on Apply, so an admin can change five things and get one reload —
 * and Cancel really does discard.
 */
function FiltersSheet({
  open,
  onOpenChange,
  value,
  onApply,
  campuses,
  teams,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Filters;
  onApply: (next: Filters) => void;
  campuses: { id: number; name: string }[];
  teams: { id: number; name: string }[];
}) {
  const [draft, setDraft] = useState<Filters>(value);
  // Re-seed the draft from the applied filters every time the panel opens.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const selectClass = "w-full";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        data-testid="sheet-leads-filters"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </SheetTitle>
          <SheetDescription>
            Narrow the leads table. Nothing changes until you press Apply.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <FilterField label="Campus">
            <CampusFilterPopover
              value={draft.campus}
              campuses={campuses}
              onChange={(v) => set("campus", v)}
              fullWidth
            />
          </FilterField>

          <FilterField label="Team">
            <TeamFilterPopover
              value={draft.team}
              teams={teams}
              onChange={(v) => set("team", v)}
              fullWidth
            />
          </FilterField>

          <FilterField label="Stage">
            <Select value={draft.stage} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-stage">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stages</SelectItem>
                {LEAD_STAGES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {STAGE_LABEL[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Source">
            <Select value={draft.source} onValueChange={(v) => set("source", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-source">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                {LEAD_SOURCES.map((src) => (
                  <SelectItem key={src} value={src}>
                    {SOURCE_LABEL[src]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Trail strength">
            <Select value={draft.trail} onValueChange={(v) => set("trail", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-trail">
                <SelectValue placeholder="Trail" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any trail</SelectItem>
                <SelectItem value="strong">Strong (70+)</SelectItem>
                <SelectItem value="moderate">Moderate (45–69)</SelectItem>
                <SelectItem value="weak">Weak (&lt;45)</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Gate A">
            <Select value={draft.gateA} onValueChange={(v) => set("gateA", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-gate-a">
                <SelectValue placeholder="Gate A" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any</SelectItem>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="BRD status">
            <Select value={draft.brd} onValueChange={(v) => set("brd", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-brd">
                <SelectValue placeholder="BRD" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any BRD status</SelectItem>
                {BRD_STATUSES.map((b) => (
                  <SelectItem key={b} value={b}>
                    {BRD_STATUS_LABEL[b]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Flags">
            <Select value={draft.flag} onValueChange={(v) => set("flag", v)}>
              <SelectTrigger className={selectClass} data-testid="select-leads-flag">
                <SelectValue placeholder="Flags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All leads</SelectItem>
                <SelectItem value="related">Related-party only</SelectItem>
                <SelectItem value="followup">Needs follow-up</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-background px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            data-testid="button-leads-filters-cancel"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setDraft(EMPTY_FILTERS)}
              disabled={countActive(draft) === 0}
              data-testid="button-leads-filters-clear"
            >
              Clear all
            </Button>
            <Button
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
              data-testid="button-leads-filters-apply"
            >
              Apply filters
              {countActive(draft) > 0 ? ` (${countActive(draft)})` : ""}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AdminLeads() {
  const [, setLocation] = useLocation();
  const { viewingId: seasonId } = useSeason();
  const { canExport } = useAdminPageAccess("/admin/leads");
  const { toast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<AdminLeadsSortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: campusOptions = [] } = useListCampuses();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const handleSort = (key: AdminLeadsSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(NUMERIC_SORT_KEYS.has(key) ? "desc" : "asc");
    }
    setPage(1);
  };

  const query: AdminLeadsQuery = {
    search: search || undefined,
    campusId: filters.campus !== ALL ? Number(filters.campus) : undefined,
    teamId: filters.team !== ALL ? Number(filters.team) : undefined,
    stage: filters.stage !== ALL ? filters.stage : undefined,
    source: filters.source !== ALL ? filters.source : undefined,
    trail: filters.trail !== ALL ? filters.trail : undefined,
    brd: filters.brd !== ALL ? filters.brd : undefined,
    gateA:
      filters.gateA === "passed" || filters.gateA === "pending"
        ? filters.gateA
        : undefined,
    relatedParty: filters.flag === "related" ? true : undefined,
    followUp: filters.flag === "followup" ? true : undefined,
    sortBy,
    sortDir,
    page,
    pageSize,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminLeadKeys.list(seasonId, query),
    queryFn: () => listAdminLeads(query),
    enabled: seasonId != null,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!data) return;
    if (data.total === 0) {
      if (page !== 1) setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(data.total / data.pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [data, page]);

  const items = data?.items ?? [];
  const s = data?.summary;
  const activeFilterCount = countActive(filters);
  const teamOptions = data?.options?.teams ?? [];

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };
  const clearFilter = (key: keyof Filters) =>
    applyFilters({ ...filters, [key]: ALL });

  // Human-readable chips for whatever is currently applied.
  const activeChips: { key: keyof Filters; label: string }[] = [];
  if (filters.campus !== ALL)
    activeChips.push({
      key: "campus",
      label:
        campusOptions.find((c) => String(c.id) === filters.campus)?.name ??
        "Campus",
    });
  if (filters.team !== ALL)
    activeChips.push({
      key: "team",
      label:
        teamOptions.find((t) => String(t.id) === filters.team)?.name ?? "Team",
    });
  if (filters.stage !== ALL)
    activeChips.push({
      key: "stage",
      label: STAGE_LABEL[filters.stage as LeadStage] ?? filters.stage,
    });
  if (filters.source !== ALL)
    activeChips.push({
      key: "source",
      label:
        SOURCE_LABEL[filters.source as keyof typeof SOURCE_LABEL] ??
        filters.source,
    });
  if (filters.trail !== ALL)
    activeChips.push({ key: "trail", label: `Trail: ${filters.trail}` });
  if (filters.gateA !== ALL)
    activeChips.push({ key: "gateA", label: `Gate A ${filters.gateA}` });
  if (filters.brd !== ALL)
    activeChips.push({
      key: "brd",
      label: BRD_STATUS_LABEL[filters.brd as BrdStatus] ?? filters.brd,
    });
  if (filters.flag !== ALL)
    activeChips.push({
      key: "flag",
      label: filters.flag === "related" ? "Related-party" : "Needs follow-up",
    });

  const downloadExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { page: _p, pageSize: _ps, ...rest } = query;
      void _p;
      void _ps;
      const res = await fetch(
        `/api/admin/leads/export.csv${adminLeadsQueryString(rest)}`,
        {
          credentials: "include",
          headers: seasonId != null ? { "x-brave-season": String(seasonId) } : {},
        },
      );
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? "brave-leads.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "CSV exported", description: filename });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header: title on the left; search → Filters → menu on the right. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Handshake className="h-7 w-7 text-primary" />
          Leads
        </h1>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search client, phone, team, campus…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="input-leads-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeFilterCount > 0 ? "default" : "outline"}
              onClick={() => setFiltersOpen(true)}
              data-testid="button-leads-filters"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-2 rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            {canExport ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    disabled={exporting}
                    data-testid="button-leads-more-actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem
                    onClick={() => void downloadExport()}
                    disabled={exporting}
                    data-testid="menu-item-leads-export-csv"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {exporting
                      ? "Exporting CSV…"
                      : "Export filtered leads (CSV)"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      </div>

      {/* Applied filters, as removable chips. */}
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => clearFilter(chip.key)}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs hover:bg-muted"
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label}
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => applyFilters(EMPTY_FILTERS)}
          >
            Clear all
          </Button>
        </div>
      ) : null}

      {data && !data.seasonSupported ? (
        <Card className="p-6 text-sm text-muted-foreground">
          The lead pipeline started in Season 2. Switch the season selector to
          Season 2 or later to see leads.
        </Card>
      ) : null}

      {/* Summary — answers "of what I'm looking at", i.e. the filtered set. */}
      {s ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="Leads"
            value={s.total.toLocaleString()}
            hint={`${(s.byStage["converted"] ?? 0).toLocaleString()} converted`}
          />
          <StatTile
            label="Gate A passed"
            value={s.gateAPassed.toLocaleString()}
            hint="3 dated interactions over 7+ days"
            tone="good"
          />
          <StatTile
            label="Need follow-up"
            value={s.needsFollowUp.toLocaleString()}
            hint="Silent 10+ days, still open"
            tone={s.needsFollowUp > 0 ? "warn" : undefined}
          />
          <StatTile
            label="Projects"
            value={s.projects.toLocaleString()}
            hint={`${s.withPayments.toLocaleString()} with payments`}
          />
          <StatTile
            label="BRD submitted"
            value={(s.submitted + s.verified + s.rejected).toLocaleString()}
            hint={`${s.brdReady} ready · ${s.verified} verified · ${s.rejected} rejected`}
          />
          <StatTile
            label="Received"
            value={formatINR(s.receivedAmount)}
            hint={`${formatINR(s.verifiedAmount)} verified`}
            tone="good"
          />
        </div>
      ) : null}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters}
        onApply={applyFilters}
        campuses={campusOptions}
        teams={teamOptions}
      />

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div
            className={cn(
              "overflow-x-auto transition-opacity",
              isFetching && "opacity-70",
            )}
          >
            <Table>
              {/* Tinted, bolder header so the column row stands apart from
                  the data rows at a glance. */}
              <TableHeader className="bg-primary/[0.07] [&_th]:h-11 [&_th]:font-semibold [&_th]:text-foreground [&_th]:whitespace-nowrap">
                <TableRow className="border-b-2 border-primary/20 hover:bg-transparent">
                  <SortHeader
                    label="Client"
                    sortKey="client"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Team"
                    sortKey="team"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <TableHead>Source</TableHead>
                  <SortHeader
                    label="Stage"
                    sortKey="stage"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Step"
                    sortKey="step"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Trail"
                    sortKey="trail"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Interactions"
                    sortKey="interactions"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <TableHead>Gate A</TableHead>
                  <SortHeader
                    label="Last contact"
                    sortKey="lastContact"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Est. value"
                    sortKey="estimatedValue"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <TableHead>Project</TableHead>
                  <SortHeader
                    label="Received"
                    sortKey="received"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortHeader
                    label="BRD"
                    sortKey="brd"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Captured"
                    sortKey="created"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setOpenLeadId(r.id)}
                    data-testid={`row-lead-${r.id}`}
                  >
                    <TableCell className="min-w-[180px]">
                      <div className="flex items-center gap-1.5 font-medium">
                        {r.businessName}
                        {r.geoCaptured ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Location captured at the client's premises
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.ownerName} · {r.phone}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.city}
                        {r.areaLocality ? `, ${r.areaLocality}` : ""} ·{" "}
                        <span className="capitalize">
                          {r.businessCategory.replace(/_/g, " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[150px]">
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/admin/teams/${r.teamId}`);
                        }}
                      >
                        {r.teamName}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {r.campusName ?? "No campus"}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {SOURCE_LABEL[r.source as keyof typeof SOURCE_LABEL] ??
                        r.source}
                      {r.isRelatedParty ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldAlert className="ml-1 inline h-3.5 w-3.5 text-amber-600" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Related party — reviewed more closely
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={r.stage} />
                    </TableCell>
                    <TableCell>
                      <StepDots step={r.pipelineStep} />
                    </TableCell>
                    <TableCell>
                      <TrailCell strength={r.trailStrength} band={r.trailBand} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.interactionCount}
                      {r.interactionsWithEvidence > 0 ? (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {r.interactionsWithEvidence}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <GateACell gateA={r.gateA} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.lastInteractionDate ? (
                        <>
                          {formatDate(r.lastInteractionDate)}
                          <div
                            className={cn(
                              "text-xs",
                              r.needsFollowUp
                                ? "text-amber-700"
                                : "text-muted-foreground",
                            )}
                          >
                            {r.silentDays === 0
                              ? "today"
                              : `${r.silentDays}d ago`}
                            {r.needsFollowUp ? " · follow up" : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {r.estimatedValue != null
                        ? formatINR(r.estimatedValue)
                        : "—"}
                    </TableCell>
                    <TableCell className="min-w-[140px] text-sm">
                      {r.project ? (
                        <>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/admin/projects/${r.project!.id}`);
                            }}
                          >
                            {r.project.title}
                          </button>
                          <div className="text-xs text-muted-foreground">
                            {r.project.phaseCount} phase
                            {r.project.phaseCount === 1 ? "" : "s"}
                            {r.project.totalContractValue != null
                              ? ` · ${formatINR(r.project.totalContractValue)}`
                              : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {r.payments.count > 0 ? (
                        <>
                          <span className="font-medium">
                            {formatINR(r.payments.received)}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            {r.payments.count} payment
                            {r.payments.count === 1 ? "" : "s"}
                            {r.payments.clientConfirmed > 0
                              ? ` · ${r.payments.clientConfirmed} confirmed`
                              : ""}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <BrdBadge status={r.brdStatus} />
                      {r.gateCRemaining != null &&
                      r.gateCRemaining > 0 &&
                      (r.brdStatus === "in_progress" ||
                        r.brdStatus === "awaiting_payment") ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {r.gateCRemaining} item
                          {r.gateCRemaining === 1 ? "" : "s"} left
                        </div>
                      ) : null}
                      {r.revenueEntry?.status === "verified" &&
                      r.revenueEntry.verifiedAmount != null ? (
                        <div className="mt-0.5 text-xs text-emerald-700">
                          {formatINR(r.revenueEntry.verifiedAmount)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-medium text-primary hover:underline">
                        View
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={15}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {data?.seasonSupported === false
                        ? "No leads in this season."
                        : "No leads match these filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {data && data.total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              testId="select-leads-page-size"
            />
            <div className="text-sm text-muted-foreground">
              {(() => {
                const start = (data.page - 1) * data.pageSize + 1;
                const end = Math.min(data.page * data.pageSize, data.total);
                return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${data.total.toLocaleString()}`;
              })()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || data.page <= 1}
              data-testid="button-leads-prev-page"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm tabular-nums">
              Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={isLoading || data.page * data.pageSize >= data.total}
              data-testid="button-leads-next-page"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <LeadDetailSheet
        leadId={openLeadId}
        seasonId={seasonId}
        onClose={() => setOpenLeadId(null)}
      />
    </div>
  );
}
