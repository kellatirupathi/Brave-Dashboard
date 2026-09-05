// The leaderboard — one compact ranked list, read top to bottom.
//
// Presentation only. Every figure comes from the leaderboard API exactly as it
// did before: rank, revenue, campus, project count, qualification and the
// per-season split are all server-computed and rendered as given.
//
// SHARED BY THREE ROLES. Admin and coordinator both mount this same component
// (pages/admin/leaderboard.tsx passes `headerExtra` for its export button), so
// role-dependent behaviour — who may open a team, who sees rank at all — stays
// inside this file rather than being duplicated per role.
import { useSeason } from "@/lib/season-context";
import { cn } from "@/lib/utils";
import { getLeaderboard, leaderboardQueryKey } from "@/lib/leaderboard-api";
import type { LeaderboardEntry } from "@/lib/leaderboard-api";
import { formatINR } from "@/lib/format";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Building2,
  TrendingUp,
  Search,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getLeaderboardConfig } from "@/lib/leaderboard-config-api";
import {
  DEFAULT_BANNER_CONTENT,
  LeaderboardBannerTemplateView,
} from "@/components/leaderboard-banner-templates";

/**
 * Per-rank styling for the podium.
 *
 * Only the first three rows are tinted. Everything below is white, because a
 * list where every row competes for attention is a list nobody can scan.
 */
const PODIUM = {
  1: {
    row: "border-[#F2D689] bg-[linear-gradient(105deg,#FFF7DC_0%,#FFF9E9_45%,#FCEBC1_100%)] hover:border-[#E9C765]",
    glow: "radial-gradient(ellipse at right center, rgba(255,215,120,.20), transparent 68%)",
    ring: "from-[#FFCC49] to-[#B97808]",
    face: "from-[#FFD766] to-[#E7A50D]",
    num: "text-[#6B4405]",
    leaf: "#E7A50D",
  },
  2: {
    row: "border-[#D8DFE8] bg-[linear-gradient(105deg,#F5F7FA_0%,#FAFBFD_50%,#EEF1F6_100%)] hover:border-[#C3CDDB]",
    glow: "radial-gradient(ellipse at right center, rgba(150,170,195,.18), transparent 68%)",
    ring: "from-[#D4DBE5] to-[#7C899A]",
    face: "from-[#E3E9F1] to-[#AAB5C5]",
    num: "text-[#4A5666]",
    leaf: "#8E9BAC",
  },
  3: {
    row: "border-[#EBC7B4] bg-[linear-gradient(105deg,#FFF2EA_0%,#FFF6F1_50%,#F6DCCB_100%)] hover:border-[#DFAF95]",
    glow: "radial-gradient(ellipse at right center, rgba(222,138,74,.16), transparent 68%)",
    ring: "from-[#DE8A4A] to-[#9E4822]",
    face: "from-[#F0AE79] to-[#BC612C]",
    num: "text-[#6B3316]",
    leaf: "#BC612C",
  },
} as const;

type PodiumRank = keyof typeof PODIUM;

const isPodium = (rank: number): rank is PodiumRank =>
  rank === 1 || rank === 2 || rank === 3;

/**
 * The rank emblem: a laurel-wreathed medal for the top three, a plain numeral
 * for everyone else. The wreath is drawn rather than imported so it inherits
 * the row's metal without shipping three more assets.
 */
function RankBadge({ rank }: { rank: number }) {
  if (!isPodium(rank)) {
    return (
      <span className="text-lg font-semibold tabular-nums text-[#6A5148]">
        {rank}
      </span>
    );
  }

  const tone = PODIUM[rank];
  return (
    <span className="relative flex h-[52px] w-[52px] items-center justify-center sm:h-[62px] sm:w-[62px]">
      <svg
        viewBox="0 0 62 62"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {/* Laurels, mirrored around the medal. */}
        <g fill={tone.leaf} opacity=".55">
          {[0, 1, 2, 3].map((i) => (
            <ellipse
              key={`l${i}`}
              cx={9 + i * 1.6}
              cy={38 - i * 8}
              rx="3.4"
              ry="6"
              transform={`rotate(${-28 + i * 10} ${9 + i * 1.6} ${38 - i * 8})`}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <ellipse
              key={`r${i}`}
              cx={53 - i * 1.6}
              cy={38 - i * 8}
              rx="3.4"
              ry="6"
              transform={`rotate(${28 - i * 10} ${53 - i * 1.6} ${38 - i * 8})`}
            />
          ))}
        </g>
        {/* A crown, only for the winner. */}
        {rank === 1 ? (
          <path
            d="M23 12 L27 17 L31 10 L35 17 L39 12 L37.5 20 L24.5 20 Z"
            fill={tone.leaf}
          />
        ) : null}
      </svg>
      <span
        className={cn(
          "relative flex h-[34px] w-[34px] items-center justify-center rounded-full bg-gradient-to-br p-[2px] shadow-sm sm:h-[38px] sm:w-[38px]",
          tone.ring,
        )}
      >
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br text-sm font-extrabold tabular-nums sm:text-base",
            tone.face,
            tone.num,
          )}
        >
          {rank}
        </span>
      </span>
    </span>
  );
}

/** Team photo when there is one, initials when there is not. */
function TeamAvatar({ entry }: { entry: LeaderboardEntry }) {
  if (entry.photoUrl) {
    return (
      <img
        src={resolveStoredObjectUrl(entry.photoUrl)}
        alt=""
        className="h-11 w-11 shrink-0 rounded-[10px] border border-[#EFE5DA] object-cover sm:h-12 sm:w-12"
      />
    );
  }
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-[#EFE5DA] bg-[#F7F2EA] text-sm font-bold text-[#715B4E] sm:h-12 sm:w-12">
      {entry.teamName.substring(0, 2).toUpperCase()}
    </span>
  );
}

function LeaderboardRow({
  entry,
  index,
  isOverall,
  seasons,
  isCurrentUserTeam,
  onOpen,
}: {
  entry: LeaderboardEntry;
  index: number;
  isOverall: boolean;
  seasons: ReturnType<typeof useSeason>["seasons"];
  isCurrentUserTeam: boolean;
  onOpen: (() => void) | null;
}) {
  const podium = isPodium(entry.rank) ? PODIUM[entry.rank] : null;
  const clickable = onOpen != null;

  return (
    <div
      {...(clickable
        ? {
            onClick: onOpen,
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen();
              }
            },
          }
        : {})}
      data-testid={`leaderboard-row-${entry.teamId}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      className={cn(
        "lb-row group relative overflow-hidden border bg-white transition-[transform,box-shadow,border-color] duration-150",
        podium ? "rounded-[14px]" : "rounded-xl border-[#E8DFD8]",
        podium?.row,
        clickable &&
          "cursor-pointer hover:-translate-y-px hover:shadow-[0_5px_14px_rgba(55,30,20,.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C99484]",
        // A quiet maroon edge, not a whole red border — it marks your row
        // without making it look like the leader.
        isCurrentUserTeam && "shadow-[inset_4px_0_0_#8B1A1A]",
      )}
    >
      {podium ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/5 sm:block"
          style={{ background: podium.glow }}
        />
      ) : null}

      <div
        className={cn(
          "relative grid items-center gap-3 px-3 sm:gap-4 sm:px-4",
          podium ? "py-3.5 sm:py-4" : "py-2.5 sm:py-3",
          // Rank, avatar, identity, revenue, chevron.
          "grid-cols-[44px_auto_minmax(0,1fr)_auto] sm:grid-cols-[68px_56px_minmax(220px,1fr)_190px_28px]",
        )}
      >
        <span className="flex items-center justify-center">
          <RankBadge rank={entry.rank} />
        </span>

        <span className="flex items-center">
          <TeamAvatar entry={entry} />
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <h3
              className={cn(
                "min-w-0 truncate text-[15px] leading-tight text-[#2A1919] sm:text-[17px]",
                entry.rank === 1 ? "font-extrabold" : "font-bold",
              )}
            >
              {entry.teamName}
            </h3>
            {isCurrentUserTeam && (
              <Badge className="h-5 rounded-full bg-[#7A1717] px-1.5 py-0 text-[10px] hover:bg-[#7A1717]">
                You
              </Badge>
            )}
            {entry.isDemoEligible && (
              <Badge className="h-5 rounded-full border-none bg-[#E8F7EE] px-1.5 py-0 text-[10px] font-semibold text-[#15744B] hover:bg-[#E8F7EE]">
                Qualified
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-[#766C69] sm:gap-2.5 sm:text-xs">
            <span className="flex min-w-0 items-center gap-1">
              <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span className="truncate">{entry.campusName}</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-[#C9BDB6]">
              •
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.8} />
              {entry.activeProjects} Projects
            </span>
          </div>
        </div>

        <div className="col-start-3 row-start-2 text-right sm:col-start-4 sm:row-start-auto">
          <div className="text-[10px] font-medium text-[#7A6B68] sm:text-[11px]">
            {isOverall ? "Overall Revenue" : "Verified Revenue"}
          </div>
          <div className="text-xl font-extrabold leading-none text-[#D51E23] sm:text-[26px]">
            {formatINR(entry.totalRevenue)}
          </div>
          {/* Overall only: which season the total came from. Seasons with no
              revenue still show as zero so every row lines up. */}
          {entry.revenueBySeason && seasons.length > 1 && (
            <div className="mt-1 flex flex-wrap justify-end gap-x-2 text-[10px] tabular-nums text-[#8B7E79]">
              {seasons.map((s) => (
                <span key={s.id}>
                  <span className="font-semibold">{s.slug}</span>{" "}
                  {formatINR(entry.revenueBySeason?.[s.id] ?? 0)}
                </span>
              ))}
            </div>
          )}
          {entry.totalOrderBook > 0 && (
            <div className="mt-0.5 text-[10px] text-[#8B7E79]">
              + {formatINR(entry.totalOrderBook)} in order book
            </div>
          )}
        </div>

        {/* The chevron is a promise that something opens, so it appears only
            for the roles that can actually open a team. */}
        <span className="hidden items-center justify-end sm:flex">
          {clickable ? (
            <ChevronRight
              className="h-[18px] w-[18px] text-[#5E514D] transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** Skeletons shaped like the rows they replace, so nothing jumps on load. */
function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-4 rounded-xl border border-[#E8DFD8] bg-white px-4",
            i < 3 ? "h-[92px]" : "h-[68px]",
          )}
        >
          <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="skeleton h-12 w-12 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-40 max-w-full rounded" />
            <div className="skeleton h-3 w-56 max-w-full rounded" />
          </div>
          <div className="skeleton h-7 w-24 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function LeaderboardSeason2({
  headerExtra,
}: { headerExtra?: ReactNode } = {}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // Coordinators default to their own campus view; students/admins to national.
  // "overall" is a third tab that combines every season. It reuses the
  // national scope server-side and only drops the season predicate.
  const [view, setView] = useState<"national" | "campus" | "overall">(
    user?.role === "coordinator" ? "campus" : "national",
  );
  const [search, setSearch] = useState("");
  // The Overall tab only appears when there is more than one season to combine.
  const { seasons, viewingId } = useSeason();
  const showOverall = seasons.length > 1;
  const canOpenTeam = user?.role === "admin" || user?.role === "coordinator";

  // Leaderboard display config: banner (image or template) + hide-rank flag.
  const isStudent = user?.role === "student";
  const { data: lbConfig, isLoading: lbConfigLoading } = useQuery({
    queryKey: ["leaderboard-config"],
    queryFn: getLeaderboardConfig,
    staleTime: 60_000,
  });
  // Hide rank ONLY for students, and only when the admin toggle is on. Admins
  // and coordinators always see rank.
  const hideRank = isStudent && (lbConfig?.hideRankForStudents ?? false);
  const bannerImage = lbConfig?.imageUrl
    ? resolveStoredObjectUrl(lbConfig.imageUrl)
    : null;
  const bannerSource = lbConfig?.bannerSource ?? "image";
  const bannerTemplate = lbConfig?.bannerTemplate ?? "broadcast";
  const bannerContent = {
    ...DEFAULT_BANNER_CONTENT,
    ...(lbConfig?.bannerContent ?? {}),
  };

  // Hand-written fetcher rather than the generated hook, because the Overall
  // tab needs a `lifetime` flag the generated query params cannot express.
  const lbQuery = {
    view: view === "campus" ? ("campus" as const) : ("national" as const),
    campusId: view === "campus" ? (user?.campusId ?? undefined) : undefined,
    search: search || undefined,
    lifetime: view === "overall",
  };
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: leaderboardQueryKey(lbQuery, viewingId),
    queryFn: () => getLeaderboard(lbQuery),
  });

  // Avoid a flash of the normal leaderboard (National / My Campus tabs) for a
  // student before we know whether rank is hidden. Wait for the config first.
  if (isStudent && lbConfigLoading) {
    return (
      <div className="mx-auto max-w-[1320px]">
        <div className="skeleton h-9 w-52 rounded-lg" />
        <div className="mt-6">
          <LeaderboardSkeleton />
        </div>
      </div>
    );
  }

  // When an admin hides rank from students, the entire ranking (search, tabs
  // and the list) is hidden — students see ONLY the banner (image or template).
  // Admins & coordinators are never affected.
  if (hideRank) {
    const hasBanner =
      bannerSource === "template"
        ? true
        : !!(bannerImage && bannerImage.trim());
    return (
      <div className="mx-auto max-w-[1320px] space-y-4 sm:space-y-6">
        <div className="mobile-page-heading">
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-muted-foreground mt-1">
            Race to ₹2,00,000 Verified Revenue
          </p>
        </div>
        {bannerSource === "template" ? (
          <LeaderboardBannerTemplateView
            template={bannerTemplate}
            content={bannerContent}
          />
        ) : hasBanner ? (
          <img
            src={bannerImage as string}
            alt="Leaderboard"
            className="w-full rounded-xl border object-contain"
            data-testid="leaderboard-banner-image"
          />
        ) : (
          <div
            className="text-center py-20 bg-card border rounded-xl border-dashed"
            data-testid="leaderboard-hidden-placeholder"
          >
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">
              The leaderboard is being finalised
            </h3>
            <p className="text-muted-foreground mt-2">
              Rankings are hidden for now — check back soon.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px]">
      {/* ── Header + controls, one row on desktop ──────────────────────── */}
      <div className="lb-enter flex flex-col justify-between gap-3 md:flex-row md:items-center md:gap-4">
        <div className="mobile-page-heading">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#271719] sm:text-[34px]">
            Leaderboard
          </h1>
          <p className="mt-0.5 text-sm text-[#786B69] sm:text-base">
            Race to ₹2,00,000 Verified Revenue
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-3 md:w-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by team, campus, member name or NIAT ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-[10px] border-[#E5DDD6] bg-white pl-9 shadow-[0_2px_6px_rgba(45,27,20,.035)] focus-visible:border-[#C99484] focus-visible:ring-2 focus-visible:ring-[#791D1D]/[.06] sm:w-[320px]"
            />
          </div>

          <Tabs
            value={view}
            onValueChange={(v: any) => setView(v)}
            className="w-full sm:w-auto"
          >
            <TabsList
              className={cn(
                "grid h-11 w-full rounded-[10px] bg-[#F4F0EA] p-[3px] sm:w-auto",
                showOverall ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <TabsTrigger
                value="national"
                className="rounded-lg text-[#685C59] data-[state=active]:border data-[state=active]:border-[#E8DED6] data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-[#451919]"
              >
                National
              </TabsTrigger>
              <TabsTrigger
                value="campus"
                className="rounded-lg text-[#685C59] data-[state=active]:border data-[state=active]:border-[#E8DED6] data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-[#451919]"
              >
                My Campus
              </TabsTrigger>
              {/* Only meaningful once a second season exists. */}
              {showOverall && (
                <TabsTrigger
                  value="overall"
                  title="Season 1 + Season 2 combined"
                  className="rounded-lg text-[#685C59] data-[state=active]:border data-[state=active]:border-[#E8DED6] data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-[#451919]"
                >
                  Overall
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {headerExtra}
        </div>
      </div>

      {/* ── The ranking ────────────────────────────────────────────────── */}
      <div className="mt-5 sm:mt-6">
        {isLoading ? (
          <LeaderboardSkeleton />
        ) : (
          // Keyed on the query so a new search re-runs the row entrance
          // rather than swapping text under the reader.
          <div key={`${view}-${search}`} className="space-y-2 sm:space-y-2.5">
            {leaderboard?.map((entry, index) => (
              <LeaderboardRow
                key={entry.teamId}
                entry={entry}
                index={index}
                isOverall={view === "overall"}
                seasons={seasons}
                isCurrentUserTeam={entry.teamId === user?.teamId}
                onOpen={
                  canOpenTeam
                    ? () => setLocation(`/teams/${entry.teamId}`)
                    : null
                }
              />
            ))}

            {leaderboard?.length === 0 && (
              <div className="rounded-xl border border-dashed bg-card py-12 text-center sm:py-16">
                <Trophy className="mx-auto mb-3 h-9 w-9 text-muted-foreground opacity-50 sm:h-11 sm:w-11" />
                <h3 className="text-base font-semibold sm:text-lg">
                  No teams found
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your filters.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
