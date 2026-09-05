// Per-user season overrides — the admin surface (additive, isolated).
//
// Pins named students to a season while everyone else follows the live one.
// Deliberately shows ONLY the pinned students: the question this page answers
// is "who is not following the live season", and listing 7,500 unpinned users
// beside them would bury the answer.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Search, UserMinus, Pin, ShieldAlert } from "lucide-react";
import { useSeason } from "@/lib/season-context";
import {
  displayName,
  listSeasonOverrides,
  searchStudents,
  seasonOverrideKeys,
  setSeasonOverride,
  type SeasonOverrideUser,
} from "@/lib/season-overrides-api";

export function SeasonOverridesCard({
  callerIsSuperAdmin,
}: {
  callerIsSuperAdmin: boolean;
}) {
  const { seasons } = useSeason();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const overridesQ = useQuery({
    queryKey: seasonOverrideKeys.list(),
    queryFn: listSeasonOverrides,
    enabled: callerIsSuperAdmin,
  });

  const searchQ = useQuery({
    queryKey: seasonOverrideKeys.search(search.trim()),
    queryFn: () => searchStudents(search.trim()),
    enabled: callerIsSuperAdmin && search.trim().length >= 2,
  });

  const save = useMutation({
    mutationFn: ({
      userId,
      seasonId,
    }: {
      userId: string;
      seasonId: number | null;
    }) => setSeasonOverride(userId, seasonId),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: seasonOverrideKeys.list() });
      void qc.invalidateQueries({ queryKey: ["season-overrides", "search"] });
      toast({
        title:
          vars.seasonId == null
            ? "Override removed"
            : "Student pinned to a season",
        description:
          vars.seasonId == null
            ? "They follow the live season again."
            : "They now see only that season, whatever is live.",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save the override",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (!callerIsSuperAdmin) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-start gap-3 p-5 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Only a super admin can pin a student to a season.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overrides = overridesQ.data?.overrides ?? [];
  const results = searchQ.data?.users ?? [];

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4" aria-hidden="true" />
          Season overrides
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Pin a student to one season. They will see only that season, whatever
          is live. Everyone without an override follows the live season exactly
          as before — this changes nothing for them.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ── Who is pinned ─────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pinned students ({overrides.length})
          </p>

          {overridesQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : overrides.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nobody is pinned. Every student follows the live season.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {overrides.map((row) => (
                <div
                  key={row.userId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  data-testid={`season-override-${row.userId}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName(row)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email ?? row.niatId ?? "—"}
                      {row.campusName ? ` · ${row.campusName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {row.seasonSlug ?? `Season ${row.seasonOverrideId}`}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({ userId: row.userId, seasonId: null })
                      }
                      data-testid={`remove-override-${row.userId}`}
                    >
                      <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pin someone new ───────────────────────────────────────── */}
        <div className="border-t pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pin a student
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or NIAT ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-season-override-search"
            />
          </div>

          {search.trim().length > 0 && search.trim().length < 2 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          ) : searchQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : search.trim().length >= 2 && results.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No students match that search.
            </p>
          ) : results.length > 0 ? (
            <div className="mt-3 space-y-2">
              {results.map((student) => (
                <StudentRow
                  key={student.userId}
                  student={student}
                  seasons={seasons}
                  pending={save.isPending}
                  onPin={(seasonId) =>
                    save.mutate({ userId: student.userId, seasonId })
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** One search result, with a button per season. */
function StudentRow({
  student,
  seasons,
  pending,
  onPin,
}: {
  student: SeasonOverrideUser;
  seasons: ReturnType<typeof useSeason>["seasons"];
  pending: boolean;
  onPin: (seasonId: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
      data-testid={`season-override-result-${student.userId}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{displayName(student)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {student.email ?? student.niatId ?? "—"}
          {student.campusName ? ` · ${student.campusName}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {seasons.map((season) => {
          const isCurrent = student.seasonOverrideId === season.id;
          return (
            <Button
              key={season.id}
              size="sm"
              variant={isCurrent ? "default" : "outline"}
              disabled={pending || isCurrent}
              onClick={() => onPin(season.id)}
              className={cn(isCurrent && "pointer-events-none")}
            >
              {isCurrent ? "Pinned to " : "Pin to "}
              {season.slug}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
