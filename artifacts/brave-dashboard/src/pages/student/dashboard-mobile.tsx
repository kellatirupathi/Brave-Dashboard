// Student dashboard — MOBILE ONLY (additive, isolated).
//
// The desktop dashboard is an analyst's screen: a four-across KPI row, a
// two-column workspace, a sticky right rail. All of that is correct at 1280px
// and wrong on a phone, where the same markup collapses into a long column of
// identical rectangles that reads as a report rather than an app.
//
// So the phone gets its own composition, driven by the SAME numbers:
//
//   maroon band  →  hero card straddling it  →  performance arc  →
//   progress centre  →  timeline + streak
//
// The arc is the deliberate departure. Four ranked metrics laid out as four
// cards say "here are four numbers"; laid out along one rising path they say
// "here is how you are doing", which is the actual question a student opens
// this screen to answer.
//
// SCOPE
// - Rendered only below `md` (768px). The desktop tree is untouched and still
//   renders from dashboard-legacy.tsx at `md` and up.
// - Owns NO data. Every value arrives as a prop, already computed by the
//   parent, so the two layouts can never disagree about a number.
//
// Deleting this file means removing its one branch in dashboard-legacy.tsx.
import { Link } from "wouter";
import {
  Wallet,
  Briefcase,
  Trophy,
  Building2,
  BarChart3,
  BookOpenCheck,
  Target,
  AlertCircle,
  MessageSquare,
  ChevronRight,
  Lock,
  Flame,
  CalendarDays,
  Award,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { JournalWeekTracker } from "@/components/journal-week-tracker";

export type MobileTone = "good" | "warn" | "bad" | "muted";

const TONE_PILL: Record<MobileTone, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-[#E51B23]",
  muted: "bg-muted text-muted-foreground",
};
const TONE_DOT: Record<MobileTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-[#E51B23]",
  muted: "bg-muted-foreground/40",
};

/** Warm ivory page ground and the card surface that sits on it. */
const CARD =
  "rounded-[22px] bg-white border border-[#F0E4DC] shadow-[0_2px_14px_rgba(99,11,18,0.05)]";

function timeGreeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Section eyebrow — matches the desktop label's role, restyled for a phone. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A6F66]">
      {children}
    </h2>
  );
}

// ── Performance arc ─────────────────────────────────────────────────────────
//
// One connected visualisation rather than four tiles. The container is
// aspect-locked to the SVG's own 360x330 viewBox, so the percentage-positioned
// HTML overlays land exactly on the SVG's nodes at ANY screen width — the one
// thing that would otherwise drift between a 320px and a 430px phone.

/** Node coordinates in the 360x330 viewBox, as percentages of it. */
const NODES = {
  revenue: { left: "8.3%", top: "63.6%" },
  order: { left: "19.4%", top: "32.7%" },
  national: { left: "50%", top: "18.2%" },
  campus: { left: "80.6%", top: "32.7%" },
  tail: { left: "91.7%", top: "63.6%" },
} as const;

function ArcNode({
  at,
  icon: Icon,
  ring,
  tint,
}: {
  at: { left: string; top: string };
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
  tint: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white",
        "border-2 shadow-[0_2px_8px_rgba(99,11,18,0.10)]",
        ring,
      )}
      style={{ left: at.left, top: at.top }}
    >
      <Icon className={cn("h-[18px] w-[18px]", tint)} />
    </span>
  );
}

function ArcLabel({
  at,
  value,
  label,
  sub,
  valueTint,
  width = 96,
}: {
  at: { left: string; top: string };
  value: React.ReactNode;
  label: string;
  sub: string;
  valueTint: string;
  width?: number;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 text-center"
      style={{ left: at.left, top: at.top, width }}
    >
      <div
        className={cn(
          "text-[15px] font-extrabold leading-tight tabular-nums",
          valueTint,
        )}
      >
        {value}
      </div>
      <div className="text-[10.5px] font-bold leading-tight text-[#2B090C]">
        {label}
      </div>
      <div className="mt-0.5 text-[9.5px] leading-[1.25] text-[#8A6F66]">
        {sub}
      </div>
    </div>
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
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8A6F66]">
        <Lock className="h-3 w-3" />
        Soon
      </span>
    );
  }
  return <>#{rank || "—"}</>;
}

export type MobileDashboardProps = {
  firstName: string;
  teamName: string;
  tagline: string;
  campusName: string;
  verifiedRevenue: number;
  orderBook: number;
  nationalRank: number | null | undefined;
  campusRank: number | null | undefined;
  rankHidden: boolean;
  revealText: string;
  progressPercent: number;
  demoDayThreshold: number;
  journalTone: MobileTone;
  journalLabel: string;
  submittedThisWeek: boolean;
  weekNumber: number | null | undefined;
  pending: number;
  totalJournals: number;
  streak: number;
  nextTier: number | null;
  tierProgress: number;
  daysLeft: number | null;
  endLabel: string | null;
  programmeEnded: boolean;
  onFeedback: () => void;
};

export function MobileDashboard(p: MobileDashboardProps) {
  return (
    // Breaks out of <main>'s padding so the maroon band can run edge to edge,
    // then re-applies its own. -mt-4 matches main's p-4.
    <div className="-mx-4 -mt-4 bg-[#FFFCF8] pb-2">
      {/* ── Maroon band. The hero card below rides up over it. ───────────── */}
      <div className="h-[92px] bg-[#630B12]" />

      <div className="-mt-[68px] space-y-5 px-4">
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className={cn(CARD, "overflow-hidden p-5")}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#6B4F47]">
                {timeGreeting()}, {p.firstName || "there"}! 👋
              </p>
              <Link
                href="/team"
                className="mt-1 block"
                data-testid="link-mobile-team"
              >
                <h1 className="break-words text-[26px] font-extrabold leading-[1.12] tracking-tight text-[#2B090C]">
                  {p.teamName}
                </h1>
                <p className="mt-1 text-[13px] leading-snug text-[#8A6F66]">
                  {p.tagline}
                </p>
              </Link>
            </div>
            {/* Decorative only — rising bars into a target. */}
            <svg
              viewBox="0 0 96 76"
              className="mt-1 h-[68px] w-[86px] shrink-0"
              aria-hidden="true"
            >
              <rect x="2" y="52" width="13" height="22" rx="3" fill="#FBD9A5" />
              <rect
                x="19"
                y="40"
                width="13"
                height="34"
                rx="3"
                fill="#C9A7F2"
              />
              <rect
                x="36"
                y="28"
                width="13"
                height="46"
                rx="3"
                fill="#9A3BFF"
                opacity="0.55"
              />
              <rect
                x="53"
                y="14"
                width="13"
                height="60"
                rx="3"
                fill="#A81B22"
              />
              <circle
                cx="76"
                cy="26"
                r="19"
                fill="none"
                stroke="#F6C6C9"
                strokeWidth="5"
              />
              <circle
                cx="76"
                cy="26"
                r="10"
                fill="none"
                stroke="#EE9AA0"
                strokeWidth="5"
              />
              <circle cx="76" cy="26" r="3.5" fill="#E51B23" />
              <path
                d="M58 46 L88 16"
                stroke="#E51B23"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M88 16 l-9 1.5 M88 16 l-1.5 9"
                stroke="#E51B23"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <path
                d="M20 16 l2.5 5.5 5.5 2.5 -5.5 2.5 -2.5 5.5 -2.5 -5.5 -5.5 -2.5 5.5 -2.5z"
                fill="#FFC400"
              />
            </svg>
          </div>

          {/* Weekly journal, nested inside the hero. */}
          <div className="mt-4 rounded-[18px] border border-[#F2E7E0] bg-[#FFFDF9] p-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  TONE_DOT[p.journalTone],
                )}
              />
              <Eyebrow>Weekly journal</Eyebrow>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                  TONE_PILL[p.journalTone],
                )}
                data-testid="mobile-journal-status"
              >
                {p.journalLabel}
              </span>
              <button
                type="button"
                onClick={p.onFeedback}
                data-testid="button-mobile-feedback"
                className="ml-auto flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold text-[#6B4F47] active:bg-black/5"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Feedback
              </button>
            </div>

            {/* Already horizontally scrollable and click-through to a week. */}
            <div className="mt-3">
              <JournalWeekTracker />
            </div>

            <p className="mt-3 text-[11px] leading-snug text-[#8A6F66]">
              Make sure to fill every weekly journal entry to remain eligible
              for Demo Day.
            </p>
          </div>
        </section>

        {/* ── Performance snapshot ───────────────────────────────────────── */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <Eyebrow>Performance snapshot</Eyebrow>
            <span className="text-[11px] font-semibold text-[#A81B22]">
              At a glance
            </span>
          </div>

          <div
            className="relative w-full"
            style={{ aspectRatio: "360 / 330" }}
            data-testid="mobile-performance-arc"
          >
            <svg
              viewBox="0 0 360 330"
              className="absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="braveArc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#12B981" />
                  <stop offset="26%" stopColor="#2583F7" />
                  <stop offset="52%" stopColor="#FF9800" />
                  <stop offset="76%" stopColor="#9A3BFF" />
                  <stop offset="100%" stopColor="#F2707A" />
                </linearGradient>
              </defs>
              <path
                d="M 30 210 A 150 150 0 0 1 330 210"
                fill="none"
                stroke="url(#braveArc)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              {/* Focal disc, drawn over the arc's lower middle. */}
              <circle cx="180" cy="252" r="70" fill="#FFFFFF" opacity="0.97" />
              <circle
                cx="180"
                cy="252"
                r="70"
                fill="none"
                stroke="#F4E7E0"
                strokeWidth="1.5"
              />
            </svg>

            <ArcNode
              at={NODES.revenue}
              icon={Wallet}
              ring="border-[#12B981]/35"
              tint="text-[#12B981]"
            />
            <ArcNode
              at={NODES.order}
              icon={Briefcase}
              ring="border-[#2583F7]/35"
              tint="text-[#2583F7]"
            />
            <ArcNode
              at={NODES.national}
              icon={Trophy}
              ring="border-[#FF9800]/40"
              tint="text-[#FF9800]"
            />
            <ArcNode
              at={NODES.campus}
              icon={Building2}
              ring="border-[#9A3BFF]/35"
              tint="text-[#9A3BFF]"
            />
            <ArcNode
              at={NODES.tail}
              icon={BarChart3}
              ring="border-[#F2707A]/40"
              tint="text-[#F2707A]"
            />

            <ArcLabel
              at={{ left: "15%", top: "72%" }}
              value={formatINR(p.verifiedRevenue)}
              label="Verified Revenue"
              sub="Counts toward Demo Day"
              valueTint="text-[#12B981]"
              width={92}
            />
            <ArcLabel
              at={{ left: "19.4%", top: "41.5%" }}
              value={formatINR(p.orderBook)}
              label="Order Book"
              sub="Committed pipeline"
              valueTint="text-[#2583F7]"
              width={92}
            />
            <ArcLabel
              at={{ left: "50%", top: "26.5%" }}
              value={<RankValue hidden={p.rankHidden} rank={p.nationalRank} />}
              label="National Rank"
              sub={p.rankHidden ? p.revealText : "All campuses"}
              valueTint="text-[#FF9800]"
              width={104}
            />
            <ArcLabel
              at={{ left: "80%", top: "41.5%" }}
              value={<RankValue hidden={p.rankHidden} rank={p.campusRank} />}
              label="Campus Rank"
              sub={p.rankHidden ? p.revealText : p.campusName}
              valueTint="text-[#9A3BFF]"
              width={96}
            />

            {/* Focal copy */}
            <div
              className="absolute w-[132px] -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ left: "50%", top: "76.4%" }}
            >
              <BarChart3
                className="mx-auto h-5 w-5 text-[#2B090C]"
                aria-hidden="true"
              />
              <p className="mt-1 text-[13px] font-extrabold text-[#2B090C]">
                Your Progress
              </p>
              <p className="mt-0.5 text-[10.5px] leading-tight text-[#8A6F66]">
                Keep going, you&apos;re doing great!
              </p>
            </div>
          </div>
        </section>

        {/* ── Progress centre ────────────────────────────────────────────── */}
        <section className={cn(CARD, "p-5")}>
          <div className="flex items-center justify-between">
            <Eyebrow>Progress center</Eyebrow>
            <Link
              href="/journal"
              className="flex min-h-[32px] items-center gap-0.5 text-[11px] font-bold text-[#A81B22]"
              data-testid="link-mobile-open-journal"
            >
              Open journal
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            {/* Journal this week */}
            <div className="min-w-0">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#FDEEF0]">
                <BookOpenCheck className="h-4 w-4 text-[#E51B23]" />
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-bold text-[#2B090C]">
                  Journal this week
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[9.5px] font-bold",
                    TONE_PILL[p.journalTone],
                  )}
                >
                  {p.journalLabel}
                </span>
              </div>
              <div className="mt-2 h-1 rounded-full bg-[#F6E3E5]">
                <div
                  className="h-1 rounded-full bg-[#E51B23] transition-[width] duration-500"
                  style={{ width: p.submittedThisWeek ? "100%" : "0%" }}
                />
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-[#8A6F66]">
                {p.weekNumber != null
                  ? `Week ${p.weekNumber}`
                  : "Submit a short 3-field journal to stay on track."}
              </p>
            </div>

            {/* Demo Day readiness */}
            <div className="min-w-0 border-l border-[#F2E7E0] pl-4">
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#FDEEF0]">
                  <Target className="h-4 w-4 text-[#E51B23]" />
                </span>
                <span className="text-[13px] font-extrabold tabular-nums text-[#2B090C]">
                  {p.progressPercent.toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 text-[12px] font-bold text-[#2B090C]">
                Demo Day readiness
              </div>
              <div className="mt-2 h-1 rounded-full bg-[#F6E3E5]">
                <div
                  className="h-1 rounded-full bg-[#12B981] transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, p.progressPercent))}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-[#8A6F66]">
                {formatINR(p.verifiedRevenue)} of{" "}
                {formatINR(p.demoDayThreshold)} verified
              </p>
            </div>

            {/* Pending submissions */}
            <div className="min-w-0 border-t border-[#F2E7E0] pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#E9F8F1]">
                  <AlertCircle className="h-4 w-4 text-[#12B981]" />
                </span>
                <span className="text-[13px] font-extrabold tabular-nums text-[#2B090C]">
                  {p.pending}
                </span>
              </div>
              <div className="mt-2 text-[12px] font-bold text-[#2B090C]">
                Pending submissions
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-[#8A6F66]">
                {p.pending > 0
                  ? "Awaiting admin review."
                  : "Nothing awaiting review."}
              </p>
            </div>

            {/* Journals submitted */}
            <div className="min-w-0 border-l border-t border-[#F2E7E0] pl-4 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#E9F8F1]">
                  <BookOpenCheck className="h-4 w-4 text-[#12B981]" />
                </span>
                <span className="text-[13px] font-extrabold tabular-nums text-[#2B090C]">
                  {p.totalJournals}
                </span>
              </div>
              <div className="mt-2 text-[12px] font-bold text-[#2B090C]">
                Journals submitted
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-[#8A6F66]">
                {p.totalJournals > 0
                  ? "Great! Keep it up."
                  : "Your first one starts the streak."}
              </p>
            </div>
          </div>
        </section>

        {/* ── Timeline + streak ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 min-[380px]:grid-cols-2">
          {/* Programme timeline — hides itself when no end date is configured,
              exactly as <ProgramCountdown /> does on desktop. */}
          {p.daysLeft != null && (
            <section
              className="rounded-[22px] border border-[#F6DADE] bg-[#FFF5F5] p-4"
              data-testid="mobile-programme-timeline"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-white">
                  <CalendarDays className="h-3.5 w-3.5 text-[#E51B23]" />
                </span>
                <Eyebrow>Programme timeline</Eyebrow>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div className="flex items-end gap-1.5">
                  <span className="text-[38px] font-extrabold leading-none tabular-nums text-[#A81B22]">
                    {p.daysLeft}
                  </span>
                  <span className="mb-1 text-[11px] font-medium text-[#8A6F66]">
                    {p.programmeEnded
                      ? "ended"
                      : p.daysLeft === 1
                        ? "day left"
                        : "days left"}
                  </span>
                </div>
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] border-[#F6C6C9]">
                  <CalendarDays className="h-4 w-4 text-[#E51B23]" />
                </span>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-[#8A6F66]">
                {p.programmeEnded ? "Ended on" : "Programme ends on"}
                <br />
                <span className="font-bold text-[#2B090C]">{p.endLabel}</span>
              </p>
            </section>
          )}

          {/* Journal streak */}
          <section
            className="rounded-[22px] border border-[#DCF0E6] bg-[#F4FBF7] p-4"
            data-testid="mobile-journal-streak"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-white">
                <Flame
                  className={cn(
                    "h-3.5 w-3.5",
                    p.streak > 0
                      ? "fill-orange-400 text-orange-500"
                      : "text-[#12B981]",
                  )}
                />
              </span>
              <Eyebrow>Journal streak</Eyebrow>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="flex items-end gap-1.5">
                <span
                  className="text-[38px] font-extrabold leading-none tabular-nums text-[#2B090C]"
                  data-testid="mobile-streak-count"
                >
                  {p.streak}
                </span>
                <span className="mb-1 text-[11px] font-medium text-[#8A6F66]">
                  week{p.streak === 1 ? "" : "s"}
                </span>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] border-[#CDEBDC]">
                <Award className="h-4 w-4 text-[#12B981]" />
              </span>
            </div>

            {p.nextTier != null ? (
              <>
                <div className="mt-2 flex items-center justify-between text-[10px] text-[#8A6F66]">
                  <span>Next badge</span>
                  <span className="tabular-nums">
                    {p.streak}/{p.nextTier} weeks
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-[#DCF0E6]">
                  <div
                    className="h-1 rounded-full bg-[#12B981] transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, p.tierProgress))}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 text-[10.5px] font-bold text-orange-600">
                Top-tier streak — you&apos;re unstoppable 🔥
              </p>
            )}

            <p className="mt-2 text-[10.5px] leading-snug text-[#8A6F66]">
              {p.streak === 0
                ? "Submit this week's journal to start your streak."
                : p.submittedThisWeek
                  ? "You're covered this week — keep it alive next week."
                  : "Submit before the week closes to keep your streak alive."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
