// Admin People's Choice Award votes — /admin/votes/peoples-choice-votes.
//
// Tab 1 (default): live standings — a bar per team, highest first, polling so
// the count moves as votes land.
// Tab 2: every vote as a row, with Leader/Member + date filters, export, and
// per-row edit/delete (students can't change a vote; admins can).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  Trophy,
  Vote,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import { useAdminPageAccess } from "@/lib/admin-access";
import {
  deletePcaVote,
  getPcaResults,
  listPcaVotes,
  pcaExportUrl,
  updatePcaVote,
  type PcaResultRow,
  type PcaVoteRow,
} from "@/lib/pca-api";

const PAGE = "/admin/votes/peoples-choice-votes";
const RESULTS_KEY = ["admin-pca-results"];

export default function AdminPcaVotes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <Trophy className="h-6 w-6 shrink-0 text-primary sm:h-7 sm:w-7" />
          People's Choice Votes
        </h1>
        <p className="text-muted-foreground">
          Live standings and every vote cast.
        </p>
      </div>

      <Tabs defaultValue="standings">
        <TabsList>
          <TabsTrigger value="standings" data-testid="tab-pca-standings">
            Standings
          </TabsTrigger>
          <TabsTrigger value="votes" data-testid="tab-pca-votes">
            All votes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standings" className="mt-4">
          <StandingsTab />
        </TabsContent>
        <TabsContent value="votes" className="mt-4">
          <VotesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab 1: standings ───────────────────────────────────────────────────────

function StandingsTab() {
  const { data, isLoading } = useQuery({
    queryKey: RESULTS_KEY,
    queryFn: getPcaResults,
    // Poll so the bars move while votes come in — this is the "live" tab.
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  const items = data?.items ?? [];
  const total = data?.totalVotes ?? 0;
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Vote className="mx-auto mb-3 h-8 w-8 opacity-40" />
          No eligible teams yet.
        </CardContent>
      </Card>
    );
  }
  // Bars are scaled against the leader, not the total — with many teams every
  // bar would otherwise be a sliver.
  const max = Math.max(1, ...items.map((i) => i.votes));

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p
          className="text-sm text-muted-foreground"
          data-testid="text-pca-total"
        >
          {total} {total === 1 ? "vote" : "votes"} cast · updating live
        </p>
        <div className="space-y-3">
          {items.map((r, i) => (
            <StandingBar key={r.teamId} row={r} rank={i + 1} max={max} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StandingBar({
  row,
  rank,
  max,
}: {
  row: PcaResultRow;
  rank: number;
  max: number;
}) {
  const pct = Math.round((row.votes / max) * 100);
  return (
    <div data-testid={`pca-standing-${row.teamId}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm">
          <span className="mr-1.5 tabular-nums text-muted-foreground">
            {rank}.
          </span>
          <span className="font-medium">{row.teamName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {row.campusName}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {row.votes}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Tab 2: all votes ───────────────────────────────────────────────────────

const ROLE_FILTERS = [
  { value: "all", label: "Leaders & members" },
  { value: "leader", label: "Leaders only" },
  { value: "member", label: "Members only" },
];

function VotesTab() {
  const queryClient = useQueryClient();
  const { canEdit, canDelete, canExport } = useAdminPageAccess(PAGE);
  const [role, setRole] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minVotes, setMinVotes] = useState("");
  const [editing, setEditing] = useState<PcaVoteRow | null>(null);
  const [deleting, setDeleting] = useState<PcaVoteRow | null>(null);

  const filters = { role, from: from || undefined, to: to || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-pca-votes", role, from, to],
    queryFn: () => listPcaVotes(filters),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-pca-votes"] });
    queryClient.invalidateQueries({ queryKey: RESULTS_KEY });
  };

  let items = data?.items ?? [];
  // "Voting count" filter: keep only votes for teams at/above N total votes.
  // Applied client-side — it's a view over the same rows, not a new query.
  const min = Number(minVotes);
  if (Number.isFinite(min) && min > 0) {
    const counts = new Map<number, number>();
    for (const v of items) {
      counts.set(v.votedTeamId, (counts.get(v.votedTeamId) ?? 0) + 1);
    }
    items = items.filter((v) => (counts.get(v.votedTeamId) ?? 0) >= min);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-[180px]" data-testid="select-pca-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-[150px]"
          data-testid="input-pca-from"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[150px]"
          data-testid="input-pca-to"
        />

        <Input
          type="number"
          min={0}
          value={minVotes}
          onChange={(e) => setMinVotes(e.target.value)}
          placeholder="Min votes"
          className="w-[120px]"
          data-testid="input-pca-min-votes"
        />

        {canExport ? (
          <Button
            asChild
            variant="outline"
            className="ml-auto"
            data-testid="button-pca-export"
          >
            <a href={pcaExportUrl(filters)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </a>
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Vote className="mx-auto mb-3 h-8 w-8 opacity-40" />
            No votes match these filters.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Voter</th>
                  <th className="p-3 font-medium">Tag</th>
                  <th className="p-3 font-medium">Their team</th>
                  <th className="p-3 font-medium">Campus</th>
                  <th className="p-3 font-medium">Voted for</th>
                  <th className="p-3 font-medium w-[280px]">Comments</th>
                  <th className="p-3 font-medium whitespace-nowrap">
                    Voted at
                  </th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t align-top hover:bg-muted/30"
                    data-testid={`pca-vote-${v.id}`}
                  >
                    <td className="p-3">
                      <div className="font-medium">{v.voterName}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.voterEmail}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={
                          v.voterRole === "leader"
                            ? "border-primary/40 text-primary"
                            : "text-muted-foreground"
                        }
                      >
                        {v.voterRole === "leader" ? "Leader" : "Member"}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {v.voterTeamName}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {v.campusName}
                    </td>
                    <td className="p-3 font-medium">{v.votedTeamName}</td>
                    <td className="p-3 whitespace-pre-wrap text-muted-foreground">
                      {v.comments || (
                        <span className="italic opacity-70">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(v.createdAt)}
                    </td>
                    <td className="p-3 text-right">
                      {canEdit || canDelete ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              data-testid={`button-pca-actions-${v.id}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit ? (
                              <DropdownMenuItem
                                onSelect={() => setEditing(v)}
                                data-testid={`menu-edit-pca-${v.id}`}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete ? (
                              <DropdownMenuItem
                                onSelect={() => setDeleting(v)}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                data-testid={`menu-delete-pca-${v.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p
            className="text-sm text-muted-foreground"
            data-testid="text-pca-count"
          >
            {items.length} {items.length === 1 ? "vote" : "votes"}
          </p>
        </>
      )}

      {editing ? (
        <EditVoteModal
          vote={editing}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      ) : null}
      {deleting ? (
        <DeleteVoteDialog
          vote={deleting}
          onClose={() => setDeleting(null)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}

// Only mounted while open, so the initial state IS the seeding.
function EditVoteModal({
  vote,
  onClose,
  onDone,
}: {
  vote: PcaVoteRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [comments, setComments] = useState(vote.comments ?? "");

  const save = useMutation({
    mutationFn: () =>
      updatePcaVote(vote.id, { comments: comments.trim() || null }),
    onSuccess: () => {
      toast({ title: "Vote updated" });
      onClose();
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit vote — {vote.voterName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <span className="text-muted-foreground">Voted for: </span>
            <span className="font-medium">{vote.votedTeamName}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pca-edit-comments">Comments</Label>
            <Textarea
              id="pca-edit-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              maxLength={2000}
              data-testid="input-edit-pca-comments"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="button-save-pca-edit"
            >
              {save.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteVoteDialog({
  vote,
  onClose,
  onDone,
}: {
  vote: PcaVoteRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => deletePcaVote(vote.id),
    onSuccess: () => {
      toast({
        title: "Vote deleted",
        description: `${vote.voterName} can now vote again.`,
      });
      onClose();
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not delete",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this vote?</AlertDialogTitle>
          <AlertDialogDescription>
            {vote.voterName}'s vote for {vote.votedTeamName} will be removed
            from the tally, and they'll be able to vote again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete-pca"
          >
            {del.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
