import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCampuses,
  useSearchCampusStudents,
  useAdminCreateTeam,
  getListTeamsQueryKey,
  type CampusStudent,
  type ErrorType,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Search, X } from "lucide-react";

type Picked = {
  userId: string;
  niatId: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

function pickStudent(s: CampusStudent): Picked | null {
  if (!s.id) return null;
  return {
    userId: s.id,
    niatId: s.niatId ?? null,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email,
  };
}

function studentLabel(p: Picked): string {
  const name = `${p.firstName} ${p.lastName}`.trim() || "Unnamed";
  const id = p.niatId || p.email;
  return `${id} — ${name}`;
}

function StudentSearch({
  campusId,
  excludeIds,
  onPick,
  placeholder,
  testId,
}: {
  campusId: number | null;
  excludeIds: Set<string>;
  onPick: (p: Picked) => void;
  placeholder: string;
  testId: string;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = !!campusId && debounced.trim().length >= 2;
  const { data: students = [], isFetching } = useSearchCampusStudents(
    { q: debounced, campusId: campusId ?? undefined },
    { query: { enabled } },
  );

  const filtered = useMemo(() => {
    return students
      .map(pickStudent)
      .filter((p): p is Picked => !!p && !excludeIds.has(p.userId));
  }, [students, excludeIds]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          disabled={!campusId}
          className="pl-9"
          data-testid={`${testId}-search`}
        />
      </div>
      {enabled && (
        <div className="border rounded-md max-h-48 overflow-y-auto bg-popover">
          {isFetching && (
            <div className="flex items-center justify-center p-3 text-sm text-muted-foreground">
              <Spinner className="w-4 h-4 mr-2" />
              Searching…
            </div>
          )}
          {!isFetching && filtered.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">
              No matching students.
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.userId}
              type="button"
              onClick={() => {
                onPick(p);
                setQ("");
                setDebounced("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex flex-col gap-0.5 border-b last:border-b-0"
              data-testid={`${testId}-result-${p.userId}`}
            >
              <span className="font-medium">{studentLabel(p)}</span>
              <span className="text-xs text-muted-foreground">
                ID: {p.userId.slice(0, 8)}…
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: campuses = [] } = useListCampuses();
  const [name, setName] = useState("");
  const [campusId, setCampusId] = useState<number | null>(null);
  const [leader, setLeader] = useState<Picked | null>(null);
  const [members, setMembers] = useState<Picked[]>([]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const adminCreateTeam = useAdminCreateTeam();

  const reset = () => {
    setName("");
    setCampusId(null);
    setLeader(null);
    setMembers([]);
  };

  useEffect(() => {
    if (!open) reset();
    // Reset leader & members when campus changes
  }, [open]);

  useEffect(() => {
    setLeader(null);
    setMembers([]);
  }, [campusId]);

  const excludeIds = useMemo(() => {
    const s = new Set<string>();
    if (leader) s.add(leader.userId);
    members.forEach((m) => s.add(m.userId));
    return s;
  }, [leader, members]);

  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length > 0 &&
    !!campusId &&
    !!leader &&
    members.length <= 4 &&
    !adminCreateTeam.isPending;

  const onSubmit = () => {
    if (!canSubmit || !campusId || !leader) return;
    adminCreateTeam.mutate(
      {
        data: {
          name: trimmedName,
          campusId,
          leaderUserId: leader.userId,
          memberUserIds: members.map((m) => m.userId),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Team created" });
          queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
          onOpenChange(false);
        },
        onError: (err: ErrorType<unknown>) => {
          toast({
            title: "Failed to create team",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add team</DialogTitle>
          <DialogDescription>
            Create an active team on behalf of students. The team is immediately
            visible to all selected members.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hyderabad Hackers"
              maxLength={60}
              data-testid="input-team-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Campus</Label>
            <Select
              value={campusId ? String(campusId) : ""}
              onValueChange={(v) => setCampusId(Number(v))}
            >
              <SelectTrigger data-testid="select-campus">
                <SelectValue placeholder="Select a campus…" />
              </SelectTrigger>
              <SelectContent>
                {campuses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Leader</Label>
            {leader ? (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/30">
                <div className="text-sm">
                  <div className="font-medium">{studentLabel(leader)}</div>
                  <div className="text-xs text-muted-foreground">
                    User ID: {leader.userId.slice(0, 8)}…
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setLeader(null)}
                  aria-label="Clear leader"
                  data-testid="button-clear-leader"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <StudentSearch
                campusId={campusId}
                excludeIds={excludeIds}
                onPick={setLeader}
                placeholder={
                  campusId
                    ? "Search by name, NIAT ID or email…"
                    : "Pick a campus first"
                }
                testId="leader"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Members (up to 4)</Label>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <Badge
                    key={m.userId}
                    variant="secondary"
                    className="pl-2 pr-1 py-1 flex items-center gap-1"
                    data-testid={`chip-member-${m.userId}`}
                  >
                    <span>{studentLabel(m)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMembers((prev) =>
                          prev.filter((x) => x.userId !== m.userId),
                        )
                      }
                      className="ml-1 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                      aria-label="Remove member"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {members.length < 4 ? (
              <StudentSearch
                campusId={campusId}
                excludeIds={excludeIds}
                onPick={(p) => setMembers((prev) => [...prev, p])}
                placeholder={
                  !campusId
                    ? "Pick a campus first"
                    : !leader
                      ? "Pick a leader first (optional)"
                      : "Add a member…"
                }
                testId="member"
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                Maximum of 4 members reached.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-add-team"
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="button-submit-add-team"
          >
            {adminCreateTeam.isPending && (
              <Spinner className="w-4 h-4 mr-2" />
            )}
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
