// Read-only banner shown on every page while an archived season is being
// viewed. Rendered once in Layout, above page content — same pattern as
// PcaVoteBanner.
//
// Self-gating: renders nothing unless the viewed season is actually read-only,
// so it is invisible for the live season and invisible entirely on a deployment
// with only one season.
//
// Admins and coordinators still see it — it tells them the student-facing
// archive is closed — but it says so in terms that make clear THEY can still
// make corrections, because the server-side guard lets them through.
import { Lock } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSeason } from "@/lib/season-context";

export function SeasonArchiveBanner() {
  const { viewing, isArchive } = useSeason();
  const { user } = useAuth();

  if (!isArchive || !viewing) return null;

  const isStaff = user?.role === "admin" || user?.role === "coordinator";

  // Which capabilities a super admin has deliberately re-opened. Worth naming,
  // because otherwise a student sees "read-only" next to a working button and
  // reasonably concludes something is broken.
  const reopened = [
    viewing.allowJournalWrites ? "weekly journals" : null,
    viewing.allowRevenueWrites ? "revenue entries" : null,
    viewing.allowProjectWrites ? "projects" : null,
  ].filter(Boolean) as string[];

  return (
    <div
      data-testid="season-archive-banner"
      role="status"
      className="mx-4 mt-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground sm:mx-6 lg:mx-8"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="m-0">
        <span className="font-semibold text-foreground">
          {viewing.name} is a read-only archive.
        </span>{" "}
        {isStaff
          ? "Students can no longer edit anything here. You can still make corrections."
          : "You can view everything you did, but journals, projects and revenue can no longer be edited."}
        {reopened.length > 0 && (
          <>
            {" "}
            An admin has temporarily re-opened {reopened.join(" and ")}.
          </>
        )}
      </p>
    </div>
  );
}
