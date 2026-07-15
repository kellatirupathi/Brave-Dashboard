// Admin Config → "Teams Submissions" page. Lists the teams that are allowed to
// add revenue / order-book entries while the global Projects Submissions Lock
// is ON (per-team exemptions). Search a team → modal to enable it; newly
// enabled teams appear at the top (latest first). Select-all + bulk toggle.
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

  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY });

  const onError = (err: unknown) =>
    toast({
      title: "Could not update",
      description: err instanceof Error ? err.message : "Please try again.",
      variant: "destructive",
    });

  // Toggle a single team on/off. Off = remove the exemption (drops from list).
  const toggleOne = useMutation({
    mutationFn: (input: { teamId: number; enabled: boolean }) =>
      setTeamExemptions(input),
    onSuccess: () => invalidate(),
    onError,
  });

  // Bulk apply the chosen state to every selected team.
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
          listed here can add revenue / order book entries. Search a team below
          to enable it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            data-testid="button-add-exempt-team"
          >
            <Plus className="w-4 h-4 mr-2" /> Add team
          </Button>
        </div>

        {/* Bulk bar */}
        {teams.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleAll}
                aria-label="Select all teams"
                data-testid="checkbox-exempt-select-all"
              />
              Select all
            </label>
            {selected.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {selected.size} selected
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulk.isPending}
                    onClick={() =>
                      bulk.mutate({
                        teamIds: [...selected],
                        enabled: true,
                      })
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
                      bulk.mutate({
                        teamIds: [...selected],
                        enabled: false,
                      })
                    }
                    data-testid="button-bulk-disable"
                  >
                    Turn off
                  </Button>
                  {bulk.isPending && <Spinner className="w-4 h-4" />}
                </div>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">
            No teams enabled. Everyone is locked while the global lock is on.
          </p>
        ) : (
          <ul className="space-y-2">
            {teams.map((t) => (
              <li
                key={t.teamId}
                className="flex items-center gap-3 rounded-md border p-3"
                data-testid={`exempt-team-${t.teamId}`}
              >
                <Checkbox
                  checked={selected.has(t.teamId)}
                  onCheckedChange={() => toggleSel(t.teamId)}
                  aria-label={`Select ${t.teamName}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.teamName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.campusName ? `${t.campusName} · ` : ""}Enabled{" "}
                    {formatDateTime(t.enabledAt)}
                  </div>
                </div>
                <Switch
                  checked
                  disabled={toggleOne.isPending}
                  onCheckedChange={() =>
                    toggleOne.mutate({ teamId: t.teamId, enabled: false })
                  }
                  aria-label={`Disable submissions for ${t.teamName}`}
                  data-testid={`switch-exempt-${t.teamId}`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AddTeamModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onEnabled={() => invalidate()}
      />
    </Card>
  );
}

// Search + enable a team. Clicking "Add" enables the team; the list refreshes
// with it on top.
function AddTeamModal({
  open,
  onOpenChange,
  onEnabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onEnabled: () => void;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(input.trim()), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  // Reset the search each time the modal opens.
  useEffect(() => {
    if (open) {
      setInput("");
      setQuery("");
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["exempt-team-search", query],
    queryFn: () => searchTeamsForExemption(query),
    enabled: query.length > 0,
  });
  const results: TeamSearchResult[] = useMemo(() => data?.items ?? [], [data]);

  const enable = useMutation({
    mutationFn: (teamId: number) =>
      setTeamExemptions({ teamId, enabled: true }),
    onSuccess: () => {
      toast({ title: "Team enabled" });
      onEnabled();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not enable team",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable a team's submissions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search teams by name or campus…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="pl-9"
              data-testid="input-exempt-team-search"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
            {query.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground italic">
                Start typing to search for a team.
              </p>
            ) : isFetching ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground italic">
                No teams found.
              </p>
            ) : (
              results.map((r) => (
                <div
                  key={r.teamId}
                  className="flex items-center gap-3 p-3"
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
                  {r.exempted ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <Check className="w-3.5 h-3.5" /> Enabled
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      disabled={enable.isPending}
                      onClick={() => enable.mutate(r.teamId)}
                      data-testid={`button-enable-team-${r.teamId}`}
                    >
                      {enable.isPending && enable.variables === r.teamId ? (
                        <Spinner className="w-4 h-4 mr-1" />
                      ) : (
                        <Plus className="w-4 h-4 mr-1" />
                      )}
                      Add
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
