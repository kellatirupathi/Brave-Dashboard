// GRIT Miles — the student's climb from verified revenue to unlocked rewards.
//
// Presentation only. Every number on this page comes from the same two sources
// it always did: verified revenue off the team dashboard summary, and the level
// ladder off the admin-configured GRIT config. `computeGritProgress` remains
// the single place that decides which level a team is on — nothing here
// re-derives it.
//
// The page is built as one horizontal hero plus a compact row per level, so all
// five levels read as a journey on one screen rather than as five large cards.
import { useEffect, useRef, useState } from "react";
import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Lock, Medal, Target, Trophy, Sparkles } from "lucide-react";
import {
  getStudentGritConfig,
  computeGritProgress,
  DEFAULT_GRIT_LEVELS,
  type GritLevel,
} from "@/lib/grit-config-api";

/**
 * Names for the rungs of the ladder.
 *
 * Presentational only — the ladder itself (targets, miles, how many levels
 * there are) is admin-configured, so a level beyond this list simply goes
 * without a subtitle rather than inventing one.
 */
const LEVEL_SUBTITLE: Record<number, string> = {
  1: "The First Step",
  2: "Build Momentum",
  3: "Raise Your Standard",
  4: "Scale With Purpose",
  5: "Impact at Scale",
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Count a number up to its target once, on mount and whenever it changes.
 *
 * Reduced motion, and a value of zero, both skip straight to the end — there is
 * nothing to watch in a count from 0 to 0.
 */
function useCountUp(target: number, durationMs = 650): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (reduced || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Same curve as the progress bar, so the two move together.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs, reduced]);

  return value;
}

/** Layered summit behind the page heading. Decorative. */
function SummitBackdrop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 520 190"
      preserveAspectRatio="xMaxYMax meet"
      className="pointer-events-none absolute -top-2 right-0 hidden h-[190px] w-[46%] select-none opacity-[0.55] lg:block"
    >
      <circle cx="330" cy="104" r="26" fill="#FFC525" opacity=".55" />
      <path d="M0 190 L118 96 L206 190 Z" fill="#F7D7B0" />
      <path d="M150 190 L286 54 L420 190 Z" fill="#F3C087" />
      <path d="M286 54 L318 90 L286 118 L254 90 Z" fill="#FFF6EA" opacity=".85" />
      <path d="M330 190 L436 24 L520 190 Z" fill="#E99453" />
      <path d="M436 24 L462 58 L436 84 L410 58 Z" fill="#FFF6EA" opacity=".9" />
      {/* The flag is the point of the whole picture, so it keeps full strength. */}
      <path d="M436 24 L436 2" stroke="#AA3428" strokeWidth="3" strokeLinecap="round" />
      <path d="M436 3 L470 12 L436 22 Z" fill="#C91F28" />
      <path
        d="M300 190 C348 150 380 120 436 30"
        fill="none"
        stroke="#D86C39"
        strokeWidth="2"
        strokeDasharray="7 8"
        opacity=".6"
      />
    </svg>
  );
}

/** The numbered circle at the head of a level row, with its own small summit. */
function GritLevelBadge({
  level,
  cleared,
  isNext,
}: {
  level: number;
  cleared: boolean;
  isNext: boolean;
}) {
  return (
    <div className="flex w-[62px] shrink-0 flex-col items-center gap-0.5 sm:w-[90px]">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold sm:h-11 sm:w-11 sm:text-base",
          cleared
            ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
            : isNext
              ? "bg-gradient-to-br from-[#FFB640] to-[#FF8A15] text-white shadow-sm"
              : "border border-[#E8D8C6] bg-[#FBF3E8] text-[#70422A]",
        )}
      >
        {level}
      </span>
      {/* Quiet reinforcement of the climb; louder on the level in play. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 60 16"
        className={cn(
          "h-3 w-[54px]",
          cleared || isNext ? "opacity-70" : "opacity-30",
        )}
      >
        <path d="M2 16 L18 4 L32 16 Z" fill="#E9C6A6" />
        <path d="M24 16 L42 1 L58 16 Z" fill="#D9A88A" />
      </svg>
    </div>
  );
}

/** State label, not a button — nothing here is clickable. */
function LevelStatePill({ cleared }: { cleared: boolean }) {
  return cleared ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-emerald-200 bg-[#E8F7EF] px-3 py-1.5 text-xs font-semibold text-[#168453] sm:text-[13px]">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Unlocked
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[9px] border border-[#F5E2AA] bg-[#FFF5D9] px-3 py-1.5 text-xs font-semibold text-[#5C4128] sm:text-[13px]">
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      Locked
    </span>
  );
}

function GritProgressBar({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="relative h-3 w-full overflow-hidden rounded-full bg-[#F2E7D6]"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#C91F28] to-[#EE7431]"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          transition: reduced
            ? undefined
            : "width 650ms cubic-bezier(.22,.61,.36,1)",
        }}
      />
      {/* Even at zero the climb has a starting point. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[#C81927]"
      />
    </div>
  );
}

function GritLevelRow({
  level,
  cleared,
  isNext,
  index,
}: {
  level: GritLevel;
  cleared: boolean;
  isNext: boolean;
  index: number;
}) {
  const subtitle = LEVEL_SUBTITLE[level.level];
  return (
    <Card
      data-testid={`grit-level-${level.level}`}
      style={{ animationDelay: `${index * 40}ms` }}
      className={cn(
        "grit-row relative overflow-hidden rounded-[15px] border-[#E9DED6] p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#E3CCB6] hover:shadow-md sm:p-4",
      )}
    >
      {/* The next target is marked by an edge, not by colouring the whole row —
          it is the one to aim at, not one already won. */}
      {isNext ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[5px] rounded-l-[15px] bg-[#F39121]"
        />
      ) : null}

      <div className="flex items-center gap-3 sm:gap-4">
        <GritLevelBadge level={level.level} cleared={cleared} isNext={isNext} />

        <div className="min-w-0 flex-1 sm:w-[240px] sm:flex-none">
          <p className="text-base font-bold text-[#4A1818] sm:text-[18px]">
            Level {level.level}
          </p>
          {subtitle ? (
            <p className="truncate text-xs text-[#766A66] sm:text-[13px]">
              {subtitle}
            </p>
          ) : null}
          {level.reward ? (
            <p className="truncate text-xs text-[#766A66]">{level.reward}</p>
          ) : null}
        </div>

        {/* On a phone these two sit under the title instead of beside it. */}
        <div className="hidden sm:block sm:w-[220px]">
          <p className="text-[13px] text-[#776B67]">Target Revenue</p>
          <p className="text-[18px] font-bold text-[#241817]">
            {formatINR(level.revenueTarget)}
          </p>
        </div>

        <div className="hidden sm:block sm:w-[170px]">
          <p className="text-[13px] text-[#776B67]">GRIT Miles</p>
          <p className="flex items-center gap-1.5 text-[18px] font-bold text-[#231817]">
            <Sparkles className="h-4 w-4 text-[#FFAE13]" aria-hidden="true" />
            {level.miles}
          </p>
        </div>

        <div className="ml-auto shrink-0">
          <LevelStatePill cleared={cleared} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:hidden">
        <div>
          <p className="text-[11px] text-[#776B67]">Target Revenue</p>
          <p className="text-sm font-bold text-[#241817]">
            {formatINR(level.revenueTarget)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-[#776B67]">GRIT Miles</p>
          <p className="flex items-center gap-1.5 text-sm font-bold text-[#231817]">
            <Sparkles className="h-3.5 w-3.5 text-[#FFAE13]" aria-hidden="true" />
            {level.miles}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Skeletons match the real shapes, so nothing jumps when the data lands. */
function GritSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="space-y-2">
        <div className="skeleton h-9 w-52 rounded-lg" />
        <div className="skeleton h-4 w-96 max-w-full rounded" />
      </div>
      <div className="skeleton h-[190px] w-full rounded-[18px]" />
      <div className="space-y-3.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-[92px] w-full rounded-[15px]" />
        ))}
      </div>
    </div>
  );
}

export default function GritMilesSeason2() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
  });

  const revenue = summary?.totalRevenue ?? 0;
  const levels = gritConfig?.levels?.length
    ? gritConfig.levels
    : DEFAULT_GRIT_LEVELS;
  const grit = computeGritProgress(revenue, levels);

  const target = grit.nextLevel?.revenueTarget ?? 0;
  const percent = target > 0 ? Math.min(100, (revenue / target) * 100) : 100;
  const countedRevenue = useCountUp(revenue);

  if (isLoading) return <GritSkeleton />;
  if (!summary) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="p-6 text-center text-sm">
          We couldn't load your GRIT Miles just now. Refresh the page to try
          again.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="grit-enter relative">
        <SummitBackdrop />
        <div className="relative">
          <h1 className="mobile-page-heading flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-[#251718] sm:text-4xl lg:text-[38px]">
            <Medal
              className="h-6 w-6 shrink-0 text-[#F28A18] sm:h-8 sm:w-8"
              aria-hidden="true"
            />
            GRIT Miles
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#756B69] sm:text-base">
            Climb the levels by growing your verified revenue and unlock GRIT
            Miles rewards.
          </p>
        </div>
      </div>

      {/* ── Progress hero ──────────────────────────────────────────────── */}
      <Card
        className="grit-enter grit-enter-2 mt-5 rounded-[18px] border-[#F1C887] bg-gradient-to-r from-[#FFF9F0] via-[#FFFDF9] to-[#FFF8EB] p-4 sm:p-6"
        data-testid="grit-hero"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4 lg:flex-1">
            <span className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[#FBE7C4] bg-white shadow-sm sm:h-[130px] sm:w-[130px]">
              <Trophy
                className="h-9 w-9 text-[#FF9D00] sm:h-16 sm:w-16"
                aria-hidden="true"
              />
              <Sparkles
                className="absolute right-3 top-3 h-3.5 w-3.5 text-[#FFBA16] sm:h-5 sm:w-5"
                aria-hidden="true"
              />
              <Sparkles
                className="absolute bottom-4 left-3 h-3 w-3 text-[#FFC525] sm:h-4 sm:w-4"
                aria-hidden="true"
              />
            </span>

            <div className="min-w-0">
              {grit.nextLevel ? (
                <>
                  <p className="text-2xl font-extrabold tracking-tight text-[#7B1118] sm:text-[38px]">
                    {formatINR(grit.revenueToNext)}
                  </p>
                  <p className="text-sm font-semibold text-[#251817] sm:text-[18px]">
                    more required to unlock {grit.nextLevel.miles} GRIT Miles
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-extrabold tracking-tight text-[#168453] sm:text-[30px]">
                    Every level unlocked
                  </p>
                  <p className="text-sm font-semibold text-[#251817] sm:text-[18px]">
                    You've earned all {grit.milesUnlocked} GRIT Miles.
                  </p>
                </>
              )}
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[#665B59] sm:text-sm">
                <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                You're at Level {grit.currentLevel} · Verified so far:{" "}
                {formatINR(revenue)}
              </p>
            </div>
          </div>

          <span
            aria-hidden="true"
            className="hidden w-px self-stretch bg-[#EFD9C5] lg:block"
          />

          {grit.nextLevel ? (
            <div className="lg:flex-1">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#251817] sm:text-sm">
                    Your Progress to Level {grit.nextLevel.level}
                  </p>
                  <p className="mt-1 text-xl font-bold text-[#251817] sm:text-[25px]">
                    {formatINR(countedRevenue)}{" "}
                    <span className="text-[#827A77]">
                      / {formatINR(grit.nextLevel.revenueTarget)}
                    </span>
                  </p>
                  <p className="text-xs text-[#827A77]">Verified Revenue</p>
                </div>
                <div className="flex h-[70px] w-[80px] shrink-0 flex-col items-center justify-center rounded-[17px] border border-[#F2D7AC] bg-[#FFFDF9] sm:h-[82px] sm:w-[88px]">
                  <span className="text-2xl font-extrabold text-[#8A171B] sm:text-[31px]">
                    {Math.floor(percent)}%
                  </span>
                  <span className="text-[11px] text-[#564745] sm:text-xs">
                    Complete
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <GritProgressBar
                  percent={percent}
                  label={`Progress to Level ${grit.nextLevel.level}`}
                />
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ── The ladder ─────────────────────────────────────────────────── */}
      <div className="mt-6 space-y-3.5">
        {levels.map((level, idx) => (
          <GritLevelRow
            key={level.level}
            level={level}
            index={idx}
            cleared={revenue >= level.revenueTarget}
            isNext={grit.nextLevel?.level === level.level}
          />
        ))}
      </div>
    </div>
  );
}
