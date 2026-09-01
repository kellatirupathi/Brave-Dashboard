// Admin Config card: Seasons.
//
// Drives the season lifecycle — which season is live, whether the other one is
// a read-only archive, and the three per-capability write overrides that can
// temporarily re-open part of an archive.
//
// Everything here except renaming/dates is SUPER-ADMIN ONLY, enforced by the
// server; the UI mirrors that so a normal admin sees why the switches are
// inert rather than getting a 403 on save.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { CalendarRange, Lock, Unlock, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getSeasons,
  getSeasonReadiness,
  saveSeason,
  type Season,
} from "@/lib/seasons-api";
import { SEASONS_QUERY_KEY } from "@/lib/season-context";

export function SeasonsAdminCard({
  callerIsSuperAdmin,
}: {
  /** Server-reported. When false every switch below is disabled. */
  callerIsSuperAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: SEASONS_QUERY_KEY,
    queryFn: getSeasons,
  });

  async function patch(season: Season, input: Parameters<typeof saveSeason>[1]) {
    setSavingId(season.id);
    try {
      await saveSeason(season.id, input);
      // The badge, switcher and every season-scoped figure read from this.
      await queryClient.invalidateQueries();
      toast({ title: `${season.name} updated` });
    } catch (err) {
      // The server refuses to activate a season that has no programme weeks.
      // Show WHICH check failed rather than a generic error, so the admin knows
      // what to go and fix.
      const data = (err as { data?: { code?: string; failing?: string[] } })
        ?.data;
      if (data?.code === "SEASON_NOT_READY") {
        toast({
          title: `${season.name} is not ready yet`,
          description: `Still needed: ${(data.failing ?? []).join(", ")}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Could not update season",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setSavingId(null);
    }
  }

  if (isLoading) {
    return (
      <Card data-testid="card-seasons">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" /> Seasons
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  const seasons = data?.seasons ?? [];

  return (
    <Card data-testid="card-seasons">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4" /> Seasons
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Exactly one season is live — activating one closes the other
          automatically. Marking a season read-only stops students editing its
          journals, projects and revenue; staff can still make corrections.
        </p>
        {!callerIsSuperAdmin && (
          <p className="text-sm text-amber-700 dark:text-amber-500">
            Only super admins can change these.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {seasons.map((s) => {
          const busy = savingId === s.id;
          const disabled = !callerIsSuperAdmin || busy;
          return (
            <div
              key={s.id}
              data-testid={`season-row-${s.slug}`}
              className={cn(
                "rounded-lg border p-4",
                s.isActive ? "border-primary/40 bg-primary/5" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest",
                    s.isReadOnly
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {s.slug}
                </span>
                <span className="font-semibold">{s.name}</span>
                {s.isActive && (
                  <span className="text-xs font-semibold text-primary">
                    Live
                  </span>
                )}
                {s.isStaffDefault && (
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Staff default
                  </span>
                )}
                {s.isReadOnly ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Unlock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {/* Shows what the programme actually runs on. The season
                      row's own dates are seeded once and rarely edited, so
                      reading them made a fully configured season look empty. */}
                  {(s.effectiveStartDate ?? s.startDate) ?? "—"} →{" "}
                  {(s.effectiveEndDate ?? s.endDate) ?? "—"} ·{" "}
                  {s.actualWeekCount && s.actualWeekCount > 0
                    ? s.actualWeekCount
                    : s.weekCount}{" "}
                  weeks
                </span>
              </div>

              {/* Setup checklist. Shown only for a season that is NOT live —
                  once it is running there is nothing left to prepare. */}
              {!s.isActive && <ReadinessChecklist seasonId={s.id} />}

              <div className="mt-3 space-y-2">
                <ToggleRow
                  label="Live season"
                  hint="New activity is written against this season."
                  checked={s.isActive}
                  disabled={disabled || s.isActive}
                  onChange={(v) => patch(s, { isActive: v })}
                />
                <ToggleRow
                  label="Default for admins & coordinators"
                  hint="Controls the season staff see first. Their own manual selection still takes priority."
                  checked={s.isStaffDefault}
                  disabled={disabled}
                  onChange={(v) => patch(s, { isStaffDefault: v })}
                />
                <ToggleRow
                  label="Read-only archive"
                  hint="Students can view but not edit. Staff are unaffected."
                  checked={s.isReadOnly}
                  disabled={disabled}
                  onChange={(v) => patch(s, { isReadOnly: v })}
                />
              </div>

              {s.isReadOnly && (
                <div className="mt-3 rounded-md bg-muted/50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Temporary write overrides
                  </p>
                  <div className="space-y-2">
                    <ToggleRow
                      label="Allow journal submissions"
                      checked={s.allowJournalWrites}
                      disabled={disabled}
                      onChange={(v) => patch(s, { allowJournalWrites: v })}
                    />
                    <ToggleRow
                      label="Allow revenue &amp; order book edits"
                      checked={s.allowRevenueWrites}
                      disabled={disabled}
                      onChange={(v) => patch(s, { allowRevenueWrites: v })}
                    />
                    <ToggleRow
                      label="Allow project changes"
                      checked={s.allowProjectWrites}
                      disabled={disabled}
                      onChange={(v) => patch(s, { allowProjectWrites: v })}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </div>
  );
}

/**
 * Pre-flight checklist for a season that is not yet live.
 *
 * Reads the SAME endpoint the activation guard uses, so it can never show a
 * green tick for something the server would then refuse. Renders nothing while
 * loading or if the check errors — a broken checklist must not imply a broken
 * season.
 */
function ReadinessChecklist({ seasonId }: { seasonId: number }) {
  const { data } = useQuery({
    queryKey: ["season-readiness", seasonId],
    queryFn: () => getSeasonReadiness(seasonId),
  });

  if (!data || data.checks.length === 0) return null;
  if (data.ready) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Ready to go live.</span>
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-md border border-amber-600/30 bg-amber-50 p-3 dark:bg-amber-950/30"
      data-testid={`readiness-${seasonId}`}
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Set this up before making it live
      </p>
      <ul className="space-y-1.5">
        {data.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs">
            <span
              className={cn(
                "mt-0.5 shrink-0",
                c.ok ? "text-emerald-600" : "text-amber-700 dark:text-amber-400",
              )}
              aria-hidden="true"
            >
              {c.ok ? "✓" : "○"}
            </span>
            <span>
              <span className="font-medium">{c.label}</span>
              <span className="block text-muted-foreground">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
