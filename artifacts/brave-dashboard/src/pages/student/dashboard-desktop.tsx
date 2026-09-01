// Student dashboard — DESKTOP / TABLET (md and up).
//
// Replaces the old four-across KPI row + two-column workspace + sticky right
// rail. That layout answered "what are my numbers"; this one answers "how am
// I doing", which is the question a student actually opens the screen with.
//
// The change of substance is the performance wave: four ranked metrics strung
// along one continuous multicolour curve through a central focal node, rather
// than four rectangles that happen to sit next to each other. Same four
// figures, one story instead of four.
//
// SCOPE
// - Rendered at `md` and up. Below that, dashboard-mobile.tsx takes over.
// - Owns NO data. Every value arrives as a prop from dashboard-legacy.tsx, so
//   the phone and the desktop can never disagree about a number.
// - Renders no sidebar and knows nothing about one.
//
// Deleting this file means removing its one branch in dashboard-legacy.tsx.
import { Link } from "wouter";
import {
  Wallet,
  Briefcase,
  Trophy,
  Building2,
  BarChart3,
  FileClock,
  PenLine,
  ChevronRight,
  Lock,
  Flame,
  CalendarDays,
  ShieldCheck,
  Star,
  CheckCircle,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JournalWeekTracker } from "@/components/journal-week-tracker";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { InstagramLink } from "@/components/instagram-link";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SubmitAsapBanner } from "@/components/projects-lock-banner";
import { SupportBanner } from "@/components/support-banner";
import type { MobileDashboardProps, MobileTone } from "./dashboard-mobile";

/** Card surface: white on the warm ivory ground, soft warm border. */
const CARD =
  "rounded-[20px] border border-[#F0E4DC] bg-white shadow-[0_2px_14px_rgba(99,11,18,0.045)]";

const TONE_PILL: Record<MobileTone, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-[#E51B23]",
  muted: "bg-muted text-muted-foreground",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6B4F47]">
      {children}
    </h2>
  );
}

// ── Performance wave ────────────────────────────────────────────────────────
//
// The curve is drawn in a 1200x210 viewBox stretched horizontally
// (preserveAspectRatio="none") so it spans whatever width the content area
// has, while the vertical axis stays 1:1 with pixels — that is what lets the
// HTML nodes sit on the curve at a fixed `top` regardless of window width.
// non-scaling-stroke keeps the line an even weight under that stretch.

/** Node x-positions as a percentage of the card's inner width. */
const WAVE = {
  revenue: 7.5,
  order: 28.75,
  centre: 50,
  national: 71.25,
  campus: 92.5,
} as const;

function WaveNode({
  leftPct,
  icon: Icon,
  ring,
  bg,
  tint,
  label,
  value,
  sub,
  href,
  testId,
}: {
  leftPct: number;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
  bg: string;
  tint: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
  href: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="absolute flex w-[164px] -translate-x-1/2 flex-col items-center rounded-xl text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ left: `${leftPct}%`, top: 40 }}
    >
      <span
        className={cn(
          "grid h-[52px] w-[52px] place-items-center rounded-full border-2 transition-transform duration-300 hover:scale-105",
          ring,
          bg,
        )}
      >
        <Icon className={cn("h-[19px] w-[19px]", tint)} />
      </span>
      <span className={cn("mt-1.5 text-[11px] font-semibold", tint)}>
        {label}
      </span>
      <span className="mt-0.5 text-[20px] font-extrabold leading-tight tabular-nums text-[#2B090C]">
        {value}
      </span>
      {sub && (
        <span className="mt-0.5 text-[10px] text-[#8A6F66]">{sub}</span>
      )}
    </Link>
  );
}

function RankValue({
  hidden,
  rank,
}: {
  hidden: boolean;
  rank: number | null | undefined;
}) {
  if (hidden) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[#8A6F66]">
        <Lock className="h-4 w-4" />
        Revealing soon
      </span>
    );
  }
  return <>#{rank || "—"}</>;
}

export type DesktopDashboardProps = MobileDashboardProps & {
  demoEligible: boolean;
};

export function DesktopDashboard(p: DesktopDashboardProps) {
  const streakStars = [1, 2, 3];

  return (
    // Breaks out of <main>'s padding to lay the warm ivory ground across the
    // whole content area, then re-applies that padding itself. Only the
    // horizontal and top edges are pulled: <main> keeps its own bottom
    // padding, which is what clears the mobile bar at narrower widths.
    <div
      className={cn(
        "-mx-6 -mt-6 px-6 pt-4 pb-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-5",
        "min-h-[calc(100vh-4rem)] bg-[#FFFCF8]",
        "space-y-3.5",
      )}
    >
      <PinnedAnnouncementBanner />
      <SubmitAsapBanner />

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section
        className={cn(CARD, "relative overflow-hidden px-6 py-5")}
        data-testid="desktop-hero"
      >
        {/* Decorative: a compact rising-bars / target illustration. The art
            has its own lower-right region so it cannot collide with the copy
            or the utility controls above it. */}
        <div
          aria-hidden="true"
          className="desktop-hero-art pointer-events-none absolute bottom-0 right-4 top-[30%] hidden w-[30%] select-none lg:block"
        >
          <svg
            viewBox="0 0 520 260"
            className="h-full w-full"
            preserveAspectRatio="xMaxYMid meet"
          >
            <circle cx="300" cy="70" r="54" fill="#FBEBD9" opacity="0.42" />
            <circle cx="118" cy="150" r="40" fill="#FBEBD9" opacity="0.3" />
            <rect
              className="desktop-hero-bar"
              style={{ animationDelay: "0ms" }}
              x="196"
              y="176"
              width="26"
              height="52"
              rx="6"
              fill="#E9B0B4"
            />
            <rect
              className="desktop-hero-bar"
              style={{ animationDelay: "55ms" }}
              x="232"
              y="150"
              width="26"
              height="78"
              rx="6"
              fill="#D98189"
            />
            <rect
              className="desktop-hero-bar"
              style={{ animationDelay: "110ms" }}
              x="268"
              y="120"
              width="26"
              height="108"
              rx="6"
              fill="#C85861"
            />
            <rect
              className="desktop-hero-bar"
              style={{ animationDelay: "165ms" }}
              x="304"
              y="88"
              width="26"
              height="140"
              rx="6"
              fill="#A81B22"
            />
            <rect
              className="desktop-hero-bar"
              style={{ animationDelay: "220ms" }}
              x="340"
              y="60"
              width="26"
              height="168"
              rx="6"
              fill="#8E0F18"
            />
            <path
              className="desktop-hero-arrow"
              d="M188 168 C 250 150, 320 108, 392 52"
              fill="none"
              stroke="#A81B22"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              className="desktop-hero-arrow-head"
              d="M392 52 l-26 4 M392 52 l-4 26"
              stroke="#A81B22"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <g className="desktop-hero-target">
              <circle cx="432" cy="132" r="58" fill="#FFFFFF" opacity="0.92" />
              <circle
                cx="432"
                cy="132"
                r="58"
                fill="none"
                stroke="#C0392B"
                strokeWidth="10"
              />
              <circle
                cx="432"
                cy="132"
                r="36"
                fill="none"
                stroke="#C0392B"
                strokeWidth="10"
              />
              <circle cx="432" cy="132" r="13" fill="#C0392B" />
              <path
                d="M470 96 l34 -30 M470 96 l-6 -22 M470 96 l22 6"
                stroke="#EF9F27"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
              />
            </g>
            <path
              d="M150 62 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z"
              fill="#EF9F27"
              opacity="0.65"
            />
            <path
              d="M486 196 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"
              fill="#EF9F27"
              opacity="0.55"
            />
          </svg>
        </div>

        {/* Actions, top-right. */}
        <div className="absolute right-5 top-4 z-10 flex items-center gap-3">
          <HelpMenu inline />
          <NotificationsBell />
        </div>

        <div className="relative z-10 max-w-[62%]">
          <Link
            href="/team"
            className="block w-fit rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="link-desktop-team"
          >
            <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-tight text-[#8E0F18]">
              {p.teamName}
            </h1>
            <p className="mt-1 text-[13px] text-[#6B4F47]">{p.tagline}</p>
          </Link>

          {p.demoEligible && (
            <Badge className="mt-2 border-none bg-green-500 px-2 py-0.5 text-[10px] text-white shadow-sm hover:bg-green-600">
              <CheckCircle className="mr-1 h-3 w-3" />
              Demo Day Eligible!
            </Badge>
          )}

          {/* Weekly journal, bottom-left inside the hero. */}
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <Eyebrow>Weekly journal</Eyebrow>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                  TONE_PILL[p.journalTone],
                )}
                data-testid="desktop-journal-status"
              >
                {p.journalLabel}
              </span>
            </div>
            <div className="mt-1.5">
              <JournalWeekTracker compact />
            </div>
          </div>
        </div>
      </section>

      {/* ── PERFORMANCE SNAPSHOT ───────────────────────────────────────── */}
      <section className={cn(CARD, "px-6 pt-3.5 pb-[52px]")}>
        <div className="flex items-center justify-between">
          <Eyebrow>Performance snapshot</Eyebrow>
          <span className="text-[10.5px] text-[#8A6F66]">At a glance</span>
        </div>

        <div
          className="relative mt-0.5 h-[136px] w-full"
          data-testid="desktop-performance-wave"
        >
          <svg
            viewBox="0 0 1200 210"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {/* Four segments, one colour each: the hand-off from metric to
                metric is the point, so a single gradient would blur it. */}
            <path
              d="M90 105 C 166 63, 269 63, 345 105"
              fill="none"
              stroke="#12B981"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M345 105 C 421 147, 524 147, 600 105"
              fill="none"
              stroke="#2583F7"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M600 105 C 676 63, 779 63, 855 105"
              fill="none"
              stroke="#FF9800"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M855 105 C 931 147, 1034 147, 1110 105"
              fill="none"
              stroke="#9A3BFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Waypoint dots, at each segment's midpoint. */}
            <circle cx="217.5" cy="68.25" r="7" fill="#12B981" />
            <circle cx="472.5" cy="141.75" r="7" fill="#2583F7" />
            <circle cx="727.5" cy="68.25" r="7" fill="#FF9800" />
            <circle cx="982.5" cy="141.75" r="7" fill="#9A3BFF" />
          </svg>

          {/* Focal node. Concentric rings rather than a drop shadow — it has to
              read as the centre of the journey, not as a card sitting on top. */}
          <div
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${WAVE.centre}%`, top: 68 }}
          >
            <div className="grid h-[126px] w-[126px] place-items-center rounded-full bg-[#FBEFE6]/50">
              <div className="grid h-[110px] w-[110px] place-items-center rounded-full bg-[#F8E4D6]/60">
                <div className="grid h-[94px] w-[94px] place-items-center rounded-full border border-[#F0E4DC] bg-white px-3 text-center shadow-[0_4px_20px_rgba(99,11,18,0.07)]">
                  <div>
                    <BarChart3
                      className="mx-auto h-[18px] w-[18px] text-[#A81B22]"
                      aria-hidden="true"
                    />
                    <p className="mt-0.5 text-[12px] font-extrabold text-[#2B090C]">
                      Your Progress
                    </p>
                    <p className="mt-0.5 text-[9.5px] leading-tight text-[#8A6F66]">
                      Keep going, you&apos;re doing great!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <WaveNode
            leftPct={WAVE.revenue}
            icon={Wallet}
            ring="border-[#12B981]/30"
            bg="bg-[#E9F8F1]"
            tint="text-[#12B981]"
            label="Verified Revenue"
            value={formatINR(p.verifiedRevenue)}
            sub="Counts toward Demo Day"
            href="/demo-day"
            testId="kpi-verified-revenue"
          />
          <WaveNode
            leftPct={WAVE.order}
            icon={Briefcase}
            ring="border-[#2583F7]/30"
            bg="bg-[#E8F1FE]"
            tint="text-[#2583F7]"
            label="Order Book"
            value={formatINR(p.orderBook)}
            sub="Committed pipeline"
            href="/projects"
            testId="kpi-order-book"
          />
          <WaveNode
            leftPct={WAVE.national}
            icon={Trophy}
            ring="border-[#FF9800]/35"
            bg="bg-[#FEF3E2]"
            tint="text-[#FF9800]"
            label="National Rank"
            value={<RankValue hidden={p.rankHidden} rank={p.nationalRank} />}
            sub={p.rankHidden ? p.revealText : "All campuses"}
            href="/leaderboard"
            testId="kpi-national-rank"
          />
          <WaveNode
            leftPct={WAVE.campus}
            icon={Building2}
            ring="border-[#9A3BFF]/30"
            bg="bg-[#F3EAFE]"
            tint="text-[#9A3BFF]"
            label="Campus Rank"
            value={<RankValue hidden={p.rankHidden} rank={p.campusRank} />}
            sub={p.rankHidden ? p.revealText : p.campusName}
            href="/leaderboard"
            testId="kpi-campus-rank"
          />
        </div>
      </section>

      {/* ── PROGRESS CENTER ────────────────────────────────────────────── */}
      <section className={cn(CARD, "px-6 py-3.5")} data-testid="progress-center">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-lg bg-[#FDEEF0]">
              <Activity className="h-3 w-3 text-[#E51B23]" />
            </span>
            <Eyebrow>Progress center</Eyebrow>
          </div>
          <Link
            href="/journal"
            className="flex items-center gap-1 text-[11px] font-semibold text-[#A81B22] hover:underline"
            data-testid="link-open-journal"
          >
            Open journal
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-2 grid grid-cols-2">
          {/* Journal this week */}
          <div className="pr-8">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[#2B090C]">
                Journal this week
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  TONE_PILL[p.journalTone],
                )}
              >
                {p.journalLabel}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-[#F6E3E5]">
              <div
                className="h-1.5 rounded-full bg-[#E51B23] transition-[width] duration-500"
                style={{ width: p.submittedThisWeek ? "100%" : "0%" }}
              />
            </div>
            <p className="mt-1 text-[10.5px] text-[#8A6F66]">
              {p.weekNumber != null
                ? `Week ${p.weekNumber}`
                : "Submit a short 3-field journal to stay on track."}
            </p>
          </div>

          {/* Demo Day readiness */}
          <div className="border-l border-[#F2E7E0] pl-8">
            <div className="text-[12px] font-semibold text-[#2B090C]">
              Demo Day readiness
            </div>
            <div className="mt-1 flex items-center gap-4">
              <span className="text-[20px] font-extrabold leading-none tabular-nums text-[#E51B23]">
                {p.progressPercent.toFixed(0)}%
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-[#F6E3E5]">
                <div
                  className="h-1.5 rounded-full bg-[#12B981] transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, p.progressPercent))}%`,
                  }}
                />
              </div>
            </div>
            <p className="mt-1 text-[10.5px] text-[#8A6F66]">
              {formatINR(p.verifiedRevenue)} of {formatINR(p.demoDayThreshold)}{" "}
              verified
            </p>
          </div>
        </div>

        {/* Inset counters */}
        <div className="mt-3 grid grid-cols-2 rounded-2xl border border-[#F2E7E0] bg-[#FFFDFB]">
          <div className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#FDEEF0]">
              <FileClock className="h-4 w-4 text-[#E51B23]" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#2B090C]">
                Pending submissions
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-extrabold leading-tight tabular-nums text-[#2B090C]">
                  {p.pending}
                </span>
                <span className="truncate text-[10px] text-[#8A6F66]">
                  {p.pending > 0
                    ? "Awaiting admin review."
                    : "Nothing awaiting review."}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 border-l border-[#F2E7E0] px-3.5 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#E9F8F1]">
              <PenLine className="h-4 w-4 text-[#12B981]" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#2B090C]">
                Journals submitted
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-extrabold leading-tight tabular-nums text-[#2B090C]">
                  {p.totalJournals}
                </span>
                <span className="truncate text-[10px] text-[#8A6F66]">
                  {p.totalJournals > 0
                    ? "Great! Keep it up."
                    : "Your first one starts the streak."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM ROW ─────────────────────────────────────────────────── */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.35fr_1fr]">
        {/* Programme timeline — hides itself when no end date is configured,
            exactly as <ProgramCountdown /> does. */}
        {p.daysLeft != null ? (
          <section
            className={cn(CARD, "px-6 py-3.5")}
            data-testid="program-countdown"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#FDEEF0]">
                <CalendarDays className="h-4 w-4 text-[#E51B23]" />
              </span>
              <Eyebrow>Programme timeline</Eyebrow>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-end gap-2">
                  <span className="text-[36px] font-extrabold leading-none tabular-nums text-[#A81B22]">
                    {p.daysLeft}
                  </span>
                  <span className="mb-0.5 text-[12px] font-medium text-[#8A6F66]">
                    {p.programmeEnded
                      ? "programme ended"
                      : p.daysLeft === 1
                        ? "day left"
                        : "days left"}
                  </span>
                </div>
                <p className="mt-1.5 text-[10.5px] text-[#8A6F66]">
                  {p.programmeEnded ? "Ended on " : "Programme ends on "}
                  <span className="font-semibold text-[#2B090C]">
                    {p.endLabel}
                  </span>
                </p>
              </div>
              <span className="relative grid h-[66px] w-[66px] shrink-0 place-items-center">
                <span className="absolute inset-0 rounded-full border-[5px] border-[#F8DDDF]" />
                <span className="absolute inset-0 rounded-full border-[5px] border-[#D8232A] border-b-transparent border-l-transparent" />
                <CalendarDays className="h-5 w-5 text-[#D8232A]" />
              </span>
            </div>
          </section>
        ) : (
          <div aria-hidden="true" />
        )}

        {/* Journal streak */}
        <section className={cn(CARD, "px-6 py-3.5")} data-testid="journal-streak">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#E9F8F1]">
              <Flame
                className={cn(
                  "h-4 w-4",
                  p.streak > 0
                    ? "fill-orange-400 text-orange-500"
                    : "text-[#12B981]",
                )}
              />
            </span>
            <Eyebrow>Journal streak</Eyebrow>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-end gap-2">
                <span
                  className="text-[36px] font-extrabold leading-none tabular-nums text-[#12B981]"
                  data-testid="rail-streak-count"
                >
                  {p.streak}
                </span>
                <span className="mb-0.5 text-[12px] font-medium text-[#8A6F66]">
                  week{p.streak === 1 ? "" : "s"}
                </span>
              </div>

              {p.nextTier != null ? (
                <>
                  <div className="mt-2 flex items-center gap-2.5">
                    <span className="text-[11.5px] text-[#8A6F66]">
                      Next badge
                    </span>
                    <span className="text-[11.5px] font-semibold tabular-nums text-[#2B090C]">
                      {p.streak}/{p.nextTier} weeks
                    </span>
                    <span className="flex items-center gap-1.5">
                      {streakStars.map((i) => {
                        const filled =
                          p.tierProgress >= (i / streakStars.length) * 100;
                        return (
                          <Star
                            key={i}
                            className={cn(
                              "h-3.5 w-3.5",
                              filled
                                ? "fill-[#FFC400] text-[#FFC400]"
                                : "fill-[#EFE4DE] text-[#EFE4DE]",
                            )}
                            aria-hidden="true"
                          />
                        );
                      })}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-[#DCF0E6]">
                    <div
                      className="h-1.5 rounded-full bg-[#12B981] transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, p.tierProgress))}%`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[11.5px] font-semibold text-orange-600">
                  Top-tier streak — you&apos;re unstoppable 🔥
                </p>
              )}

              <p className="mt-2 text-[11.5px] text-[#8A6F66]">
                {p.streak === 0
                  ? "Submit this week's journal to start your streak."
                  : p.submittedThisWeek
                    ? "You're covered this week — keep it alive next week."
                    : "Submit before the week closes to keep your streak alive."}
              </p>
            </div>

            <span className="relative grid h-[66px] w-[66px] shrink-0 place-items-center rounded-full bg-[#F4FBF7]">
              <span className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#CDEBDC]" />
              <ShieldCheck className="h-6 w-6 text-[#12B981]" />
            </span>
          </div>
        </section>

        {/* Social */}
        <InstagramLink className="h-fit rounded-[20px] border-[#F0E4DC] shadow-[0_2px_14px_rgba(99,11,18,0.045)]" />
      </div>

      <SupportBanner />
    </div>
  );
}
