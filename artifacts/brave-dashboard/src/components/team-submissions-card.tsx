// Admin Config → "Teams Submissions" page. Lists the teams that are allowed to
// add revenue / order-book entries while the global Projects Submissions Lock
// is ON (per-team exemptions).
//
// Layout: a search box + "Add team" button across the top. Typing shows
// matching teams right below the search; clicking a result opens a small popup
// with an on/off toggle for that team. The enabled teams render as a table
// (newest-enabled first) with a select-all + bulk on/off.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Unlock, Search, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  listTeamExemptions,
  searchTeamsForExemption,
  setTeamExemptions,
  type ExemptTeam,
  type TeamSearchResult,
} from "@/lib/team-submissions-api";

const EXEMPTIONS_KEY = ["admin-team-exemptions"];

export function TeamSubmissionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: EXEMPTIONS_KEY,
    queryFn: listTeamExemptions,
  });
  const teams: ExemptTeam[] = data?.items ?? [];

  const [selected, setSelected] = useState<Set<number>>(new Set());
  // The team whose on/off popup is open (from a search result or a table row).
  const [popupTeam, setPopupTeam] = useState<{
    teamId: number;
    teamName: string;
    campusName: string;
    exempted: boolean;
  } | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY });

  const onError = (err: unknown) =>
    toast({
      title: "Could not update",
      description: err instanceof Error ? err.message : "Please try again.",
      variant: "destructive",
    });

  const bulk = useMutation({
    mutationFn: (input: { teamIds: number[]; enabled: boolean }) =>
      setTeamExemptions(input),
    onSuccess: (_r, vars) => {
      toast({
        title: vars.enabled
          ? "Submissions enabled for selected teams"
          : "Submissions disabled for selected teams",
      });
      setSelected(new Set());
      invalidate();
    },
    onError,
  });

  const allSelected = teams.length > 0 && selected.size === teams.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(teams.map((t) => t.teamId)));
  const toggleSel = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card data-testid="card-team-submissions">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Unlock className="w-5 h-5 text-primary" /> Teams Submissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          While the global Projects Submissions Lock is ON, only the teams
          listed here can add revenue / order book entries. Search a team to
          enable it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top row: search + Add team */}
        <TeamSearchRow
          onPick={(r) =>
            setPopupTeam({
              teamId: r.teamId,
              teamName: r.teamName,
              campusName: r.campusName,
              exempted: r.exempted,
            })
          }
        />

        {/* Bulk bar (only when there are rows selected) */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={bulk.isPending}
                onClick={() =>
                  bulk.mutate({ teamIds: [...selected], enabled: true })
                }
                data-testid="button-bulk-enable"
              >
                Turn on
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulk.isPending}
                onClick={() =>
                  bulk.mutate({ teamIds: [...selected], enabled: false })
                }
                data-testid="button-bulk-disable"
              >
                Turn off
              </Button>
              {bulk.isPending && <Spinner className="w-4 h-4" />}
            </div>
          </div>
        )}

        {/* Enabled teams — table */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">
            No teams enabled. Everyone is locked while the global lock is on.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all teams"
                      data-testid="checkbox-exempt-select-all"
                    />
                  </th>
                  <th className="p-3 font-medium">Team</th>
                  <th className="p-3 font-medium">Campus</th>
                  <th className="p-3 font-medium whitespace-nowrap">
                    Enabled at
                  </th>
                  <th className="p-3 font-medium text-right">Submissions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr
                    key={t.teamId}
                    className="border-t hover:bg-muted/30"
                    data-testid={`exempt-team-${t.teamId}`}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selected.has(t.teamId)}
                        onCheckedChange={() => toggleSel(t.teamId)}
                        aria-label={`Select ${t.teamName}`}
                      />
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        className="font-medium text-left hover:underline"
                        onClick={() =>
                          setPopupTeam({
                            teamId: t.teamId,
                            teamName: t.teamName,
                            campusName: t.campusName,
                            exempted: true,
                          })
                        }
                        data-testid={`open-exempt-popup-${t.teamId}`}
                      >
                        {t.teamName}
                      </button>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {t.campusName || "—"}
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(t.enabledAt)}
                    </td>
                    <td className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <Check className="w-3.5 h-3.5" /> On
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <TeamTogglePopup
        team={popupTeam}
        onClose={() => setPopupTeam(null)}
        onChanged={() => invalidate()}
      />
    </Card>
  );
}

// Top-of-page search + "Add team". Typing shows matching teams below; picking
// one bubbles up so the page can open the on/off popup.
function TeamSearchRow({ onPick }: { onPick: (r: TeamSearchResult) => void }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(input.trim()), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ["exempt-team-search", query],
    queryFn: () => searchTeamsForExemption(query),
    enabled: query.length > 0,
  });
  const results: TeamSearchResult[] = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams by name or campus…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="pl-9"
            data-testid="input-exempt-team-search"
          />
        </div>
        <Button
          onClick={() => setOpen(true)}
          data-testid="button-add-exempt-team"
        >
          <Plus className="w-4 h-4 mr-2" /> Add team
        </Button>
      </div>

      {/* Search results appear below the search box. */}
      {open && query.length > 0 && (
        <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
          {isFetching ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground italic">
              No teams found.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.teamId}
                type="button"
                onClick={() => {
                  onPick(r);
                  setOpen(false);
                  setInput("");
                  setQuery("");
                }}
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40"
                data-testid={`exempt-search-row-${r.teamId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.teamName}</div>
                  {r.campusName && (
                    <div className="text-xs text-muted-foreground truncate">
                      {r.campusName}
                    </div>
                  )}
                </div>
                {r.exempted && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> Enabled
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Popup with a single on/off toggle for one team. Opened by clicking a search
// result or a team row.
function TeamTogglePopup({
  team,
  onClose,
  onChanged,
}: {
  team: {
    teamId: number;
    teamName: string;
    campusName: string;
    exempted: boolean;
  } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);

  // Sync the toggle to the team's current state each time the popup opens.
  useEffect(() => {
    if (team) setEnabled(team.exempted);
  }, [team]);

  const mutate = useMutation({
    mutationFn: (next: boolean) =>
      setTeamExemptions({ teamId: team!.teamId, enabled: next }),
    onSuccess: (_r, next) => {
      toast({
        title: next
          ? "Submissions enabled for this team"
          : "Submissions disabled for this team",
      });
      onChanged();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={team != null} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{team?.teamName ?? "Team"}</DialogTitle>
        </DialogHeader>
        {team && (
          <div className="space-y-4">
            {team.campusName && (
              <p className="text-sm text-muted-foreground">{team.campusName}</p>
            )}
            <div className="flex items-center justify-between rounded-md border p-4">
              <div>
                <p className="font-medium text-sm">Allow submissions</p>
                <p className="text-xs text-muted-foreground max-w-[36ch]">
                  Let this team add revenue / order book entries even while the
                  global lock is on.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={mutate.isPending}
                onCheckedChange={(c) => {
                  setEnabled(c);
                  mutate.mutate(c);
                }}
                data-testid="switch-team-popup"
              />
            </div>
            {mutate.isPending && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Spinner className="w-3.5 h-3.5" /> Saving…
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
