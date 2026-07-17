// People's Choice Award nudge — a single row pinned above the page content on
// EVERY student page (mounted once in Layout). Text left, Vote button right,
// with a light sweeping left→right so it catches the eye without moving the
// layout.
//
// It self-gates entirely: it renders nothing unless voting is open, this
// person is eligible, and they haven't voted yet. Once they vote it's gone —
// that's their confirmation the vote landed.
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Trophy } from "lucide-react";
import { getPcaMe } from "@/lib/pca-api";

export const PCA_ME_KEY = ["pca-me"];

export function PcaVoteBanner() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: PCA_ME_KEY,
    queryFn: getPcaMe,
    staleTime: 60_000,
    // Students only — no need to ask on admin/coordinator pages.
    enabled: user?.role === "student",
  });

  if (!data?.enabled || !data.eligible || data.hasVoted) return null;

  return (
    <div
      className="relative overflow-hidden border-b border-amber-300/70 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
      data-testid="banner-pca-vote"
    >
      <style>{`
        @keyframes pca-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .pca-shimmer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            100deg,
            transparent 25%,
            rgba(255, 255, 255, .65) 50%,
            transparent 75%
          );
          animation: pca-shimmer 2.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .pca-shimmer { display: none; } }
      `}</style>
      <span className="pca-shimmer dark:opacity-10" aria-hidden="true" />

      <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <p className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
          <Trophy className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">
              People's Choice Award voting is open.
            </span>{" "}
            <span className="hidden sm:inline">
              Pick the team whose work impressed you most — you get one vote.
            </span>
          </span>
        </p>
        <Link href="/vote/people-choice-award">
          <span
            className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-amber-500 px-3.5 text-xs font-bold uppercase tracking-wide text-amber-950 shadow-sm transition-colors hover:bg-amber-400"
            data-testid="button-pca-vote"
          >
            Vote now
          </span>
        </Link>
      </div>
    </div>
  );
}
