import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpenCheck,
  AlertCircle,
  CheckCircle2,
  Megaphone,
  PencilLine,
  Users,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  getJournalTracking,
  listOpenWeeks,
  fillCoordinatorJournal,
  bulkFillCoordinatorJournal,
  broadcastCoordinatorMessage,
  type JournalTrackingRow,
} from "@/lib/progress-api";

function sourceBadge(row: JournalTrackingRow) {
  if (!row.submitted)
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        <AlertCircle className="w-3 h-3 mr-1" /> Not submitted
      </Badge>
    );
  const by = row.submittedByRole === "student" ? "Student" : "Coordinator";
  return (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <CheckCircle2 className="w-3 h-3 mr-1" /> {by}
    </Badge>
  );
}

export default function CoordinatorJournalTracking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: openWeeks } = useQuery({
    queryKey: ["journal", "open-weeks"],
    queryFn: listOpenWeeks,
  });
  const [weekId, setWeekId] = useState<number | null>(null);

  const { data: tracking, isLoading } = useQuery({
    queryKey: ["coord-journal-tracking", weekId],
    queryFn: () => getJournalTracking(weekId ? { weekId } : undefined),
  });

  const effectiveWeekId = tracking?.week?.weekId ?? weekId ?? null;
  const teams = useMemo(() => tracking?.teams ?? [], [tracking]);
  const missing = teams.filter((t) => !t.submitted);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allSelected = teams.length > 0 && selected.size === teams.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(teams.map((t) => t.teamId)));
  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["coord-journal-tracking"] });

  // ── Single fill ──────────────────────────────────────────────────────────
  const [fillTeam, setFillTeam] = useState<JournalTrackingRow | null>(null);
  const [fWhat, setFWhat] = useState("");
  const [fBlockers, setFBlockers] = useState("");
  const [fNext, setFNext] = useState("");

  const fillMut = useMutation({
    mutationFn: () =>
      fillCoordinatorJournal({
        teamId: fillTeam!.teamId,
        weekId: effectiveWeekId ?? undefined,
        whatWeDid: fWhat.trim(),
        blockers: fBlockers.trim() || undefined,
        nextWeekPlan: fNext.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Journal filled" });
      setFillTeam(null);
      setFWhat("");
      setFBlockers("");
      setFNext("");
      refresh();
    },
    onError: (e: unknown) =>
      toast({
        title: "Couldn't fill journal",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  // ── Bulk fill ────────────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bWhat, setBWhat] = useState("");
  const [bBlockers, setBBlockers] = useState("");
  const [bNext, setBNext] = useState("");

  const bulkMut = useMutation({
    mutationFn: () =>
      bulkFillCoordinatorJournal({
        teamIds: Array.from(selected),
        weekId: effectiveWeekId ?? undefined,
        whatWeDid: bWhat.trim(),
        blockers: bBlockers.trim() || undefined,
        nextWeekPlan: bNext.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast({
        title: `Filled ${r.filled} journal${r.filled === 1 ? "" : "s"}`,
      });
      setBulkOpen(false);
      setBWhat("");
      setBBlockers("");
      setBNext("");
      setSelected(new Set());
      refresh();
    },
    onError: (e: unknown) =>
      toast({
        title: "Bulk fill failed",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  // ── Broadcast ────────────────────────────────────────────────────────────
  const [castOpen, setCastOpen] = useState(false);
  const [cTitle, setCTitle] = useState("");
  const [cMsg, setCMsg] = useState("");

  const castMut = useMutation({
    mutationFn: () =>
      broadcastCoordinatorMessage({
        teamIds: Array.from(selected),
        title: cTitle.trim(),
        message: cMsg.trim(),
      }),
    onSuccess: (r) => {
      toast({
        title: "Message sent",
        description: `Notified ${r.notifiedUsers} member${
          r.notifiedUsers === 1 ? "" : "s"
        } across ${r.notifiedTeams} team${r.notifiedTeams === 1 ? "" : "s"}.`,
      });
      setCastOpen(false);
      setCTitle("");
      setCMsg("");
    },
    onError: (e: unknown) =>
      toast({
        title: "Broadcast failed",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpenCheck className="w-7 h-7 text-primary" /> Journals Tracking
          </h1>
          <p className="text-muted-foreground mt-1">
            See which teams have submitted, fill journals on their behalf, and
            send bulk updates.
          </p>
        </div>
        <Select
          value={effectiveWeekId ? String(effectiveWeekId) : ""}
          onValueChange={(v) => setWeekId(Number(v))}
        >
          <SelectTrigger className="w-56" data-testid="select-tracking-week">
            <SelectValue placeholder="Current week" />
          </SelectTrigger>
          <SelectContent>
            {(openWeeks ?? []).map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                Week {w.weekNumber} ({w.startDate.slice(5)} →{" "}
                {w.endDate.slice(5)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Coverage summary */}
      <Card>
        <CardContent className="p-5">
          {isLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Spinner />
            </div>
          ) : !tracking?.week ? (
            <p className="text-sm text-muted-foreground">
              No programme weeks are open yet.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-bold">
                  {tracking.submittedCount} / {tracking.totalTeams}
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    teams submitted
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Week {tracking.week.weekNumber} · {tracking.week.startDate} →{" "}
                  {tracking.week.endDate}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-sm flex items-center gap-1"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                {missing.length} needing attention
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            data-testid="checkbox-select-all-teams"
          />
          Select all ({selected.size} selected)
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => setBulkOpen(true)}
          data-testid="button-bulk-fill"
        >
          <PencilLine className="w-4 h-4 mr-1" /> Fill common journal
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0}
          onClick={() => setCastOpen(true)}
          data-testid="button-broadcast"
        >
          <Megaphone className="w-4 h-4 mr-1" /> Broadcast message
        </Button>
      </div>

      {/* Teams Needing Attention */}
      {missing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" /> Teams Needing
              Attention
            </CardTitle>
            <CardDescription>
              {missing.length} team{missing.length === 1 ? "" : "s"} haven't
              submitted this week's journal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {missing.map((t) => (
              <div
                key={t.teamId}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                data-testid={`needs-attention-${t.teamId}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox
                    checked={selected.has(t.teamId)}
                    onCheckedChange={() => toggleOne(t.teamId)}
                  />
                  <span className="font-medium truncate">{t.teamName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/teams/${t.teamId}`}>
                      <ExternalLink className="w-4 h-4 mr-1" /> View Team
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFillTeam(t);
                      setFWhat("");
                      setFBlockers("");
                      setFNext("");
                    }}
                    data-testid={`button-fill-${t.teamId}`}
                  >
                    <PencilLine className="w-4 h-4 mr-1" /> Fill Journal
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* All teams */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> All teams
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No active teams in your campus.
            </p>
          ) : (
            <div className="space-y-2">
              {teams.map((t) => (
                <div
                  key={t.teamId}
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  data-testid={`team-row-${t.teamId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={selected.has(t.teamId)}
                      onCheckedChange={() => toggleOne(t.teamId)}
                    />
                    <span className="font-medium truncate">{t.teamName}</span>
                    {sourceBadge(t)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/teams/${t.teamId}`}>
                        <ExternalLink className="w-4 h-4 mr-1" /> View Team
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant={t.submitted ? "outline" : "default"}
                      onClick={() => {
                        setFillTeam(t);
                        setFWhat("");
                        setFBlockers("");
                        setFNext("");
                      }}
                      data-testid={`button-fill-all-${t.teamId}`}
                    >
                      <PencilLine className="w-4 h-4 mr-1" />
                      {t.submitted ? "Edit" : "Fill"} Journal
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single fill dialog */}
      <Dialog open={!!fillTeam} onOpenChange={(o) => !o && setFillTeam(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Fill journal — {fillTeam?.teamName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">
                What did the team do this week?{" "}
                <span className="text-red-500">*</span>
              </label>
              <Textarea
                rows={4}
                value={fWhat}
                onChange={(e) => setFWhat(e.target.value)}
                maxLength={2000}
                data-testid="fill-what"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Blockers (optional)
              </label>
              <Textarea
                rows={2}
                value={fBlockers}
                onChange={(e) => setFBlockers(e.target.value)}
                maxLength={2000}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Plan for next week (optional)
              </label>
              <Textarea
                rows={2}
                value={fNext}
                onChange={(e) => setFNext(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFillTeam(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => fillMut.mutate()}
              disabled={fWhat.trim().length < 1 || fillMut.isPending}
              data-testid="button-submit-fill"
            >
              {fillMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk fill dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Fill common journal — {selected.size} team
              {selected.size === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The same update is filed for every selected team (e.g. "Mid-sem
              exams ongoing; activity reduced this week").
            </p>
            <Textarea
              rows={4}
              placeholder="What happened this week? *"
              value={bWhat}
              onChange={(e) => setBWhat(e.target.value)}
              maxLength={2000}
              data-testid="bulk-what"
            />
            <Textarea
              rows={2}
              placeholder="Blockers (optional)"
              value={bBlockers}
              onChange={(e) => setBBlockers(e.target.value)}
              maxLength={2000}
            />
            <Textarea
              rows={2}
              placeholder="Plan for next week (optional)"
              value={bNext}
              onChange={(e) => setBNext(e.target.value)}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkMut.mutate()}
              disabled={bWhat.trim().length < 1 || bulkMut.isPending}
              data-testid="button-submit-bulk"
            >
              {bulkMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Apply to {selected.size} team{selected.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Broadcast dialog */}
      <Dialog open={castOpen} onOpenChange={setCastOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Broadcast message — {selected.size} team
              {selected.size === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (e.g. Journal reminder) *"
              value={cTitle}
              onChange={(e) => setCTitle(e.target.value)}
              maxLength={160}
              data-testid="broadcast-title"
            />
            <Textarea
              rows={4}
              placeholder="Message to all members of the selected teams *"
              value={cMsg}
              onChange={(e) => setCMsg(e.target.value)}
              maxLength={2000}
              data-testid="broadcast-message"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCastOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => castMut.mutate()}
              disabled={
                cTitle.trim().length < 1 ||
                cMsg.trim().length < 1 ||
                castMut.isPending
              }
              data-testid="button-submit-broadcast"
            >
              {castMut.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
