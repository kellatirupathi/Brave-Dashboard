// Past Seasons — a student's finished work, read back (additive, isolated).
//
// Season 1 is settled: its revenue is verified, its journals are submitted and
// its projects are closed. A student should be able to look at all of it and
// change none of it.
//
// The page is built so that reads like a fact rather than a rule. There are no
// edit controls, no submit buttons and no week tracker — not disabled ones,
// absent ones — and the whole surface is a shade quieter than the live pages.
// Someone who cannot find a way to edit will not try; that works better than a
// warning nobody reads.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, BookOpen, Briefcase, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatDate, formatINR } from "@/lib/format";
import {
  archiveKeys,
  getArchiveJournals,
  getArchiveProjects,
  getArchiveSeasons,
  type ArchiveJournal,
  type ArchiveProject,
} from "@/lib/student-archive-api";

type Tab = "journals" | "projects";

export default function PastSeasons() {
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("journals");

  const seasonsQ = useQuery({
    queryKey: archiveKeys.seasons(),
    queryFn: getArchiveSeasons,
  });
  const seasons = seasonsQ.data?.seasons ?? [];

  // Land on the most recent earlier season once the list arrives, rather than
  // making the student choose before anything is on screen.
  useEffect(() => {
    if (seasonId == null && seasons.length > 0) {
      setSeasonId(seasons[0]!.id);
    }
  }, [seasons, seasonId]);

  const selected = seasons.find((s) => s.id === seasonId) ?? null;

  const journalsQ = useQuery({
    queryKey: archiveKeys.journals(seasonId ?? 0),
    queryFn: () => getArchiveJournals(seasonId as number),
    enabled: seasonId != null,
  });
  const projectsQ = useQuery({
    queryKey: archiveKeys.projects(seasonId ?? 0),
    queryFn: () => getArchiveProjects(seasonId as number),
    enabled: seasonId != null,
  });

  if (seasonsQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // No earlier season at all — a first-term student. Say so plainly rather
  // than showing an empty archive that looks broken.
  if (seasons.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <PageHeading />
        <Card className="mt-6 border-dashed bg-[#FAF8F5] p-10 text-center">
          <BookOpen
            className="mx-auto h-9 w-9 text-muted-foreground opacity-50"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-base font-semibold">No earlier seasons</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is your first season. Your work will appear here next time.
          </p>
        </Card>
      </div>
    );
  }

  const journals = journalsQ.data?.journals ?? [];
  const projects = projectsQ.data?.projects ?? [];
  const loading = journalsQ.isLoading || projectsQ.isLoading;

  return (
    // A warm grey ground rather than the white of the live pages. The quiet is
    // the point: this should feel like looking back, not like working.
    <div className="-mx-4 -mt-4 min-h-[calc(100vh-4rem)] bg-[#FAF8F5] px-4 pb-10 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeading />
          {seasons.length > 1 ? (
            <div className="relative">
              <select
                aria-label="Choose a season"
                data-testid="past-seasons-select"
                value={seasonId ?? ""}
                onChange={(e) => setSeasonId(Number(e.target.value))}
                className="h-9 appearance-none rounded-lg border bg-white py-0 pl-3 pr-8 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    Season {s.slug}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : selected ? (
            <span className="rounded-lg border bg-white px-3 py-1.5 text-sm font-medium">
              Season {selected.slug}
            </span>
          ) : null}
        </div>

        {/* The archive band. States the rule once, at the top, so the rest of
            the page does not have to keep repeating it. */}
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#E6DCD2] bg-[#F3EDE5] px-4 py-3">
          <Lock
            className="mt-0.5 h-4 w-4 shrink-0 text-[#8A6F66]"
            aria-hidden="true"
          />
          <p className="text-sm text-[#5A4A43]">
            <strong className="font-semibold">
              Season {selected?.slug ?? ""} archive
            </strong>{" "}
            — a record of finished work. Nothing here can be changed.
          </p>
        </div>

        {/* Tabs, counted so the student can see what is there before clicking. */}
        <div className="mt-5 flex gap-1 border-b">
          <TabButton
            active={tab === "journals"}
            onClick={() => setTab("journals")}
            icon={BookOpen}
            label="Weekly Journal"
            count={selected?.journalCount ?? 0}
            testId="tab-archive-journals"
          />
          <TabButton
            active={tab === "projects"}
            onClick={() => setTab("projects")}
            icon={Briefcase}
            label="Projects"
            count={selected?.projectCount ?? 0}
            testId="tab-archive-projects"
          />
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : tab === "journals" ? (
            journals.length === 0 ? (
              <EmptySeason kind="journals" slug={selected?.slug ?? ""} />
            ) : (
              <div className="space-y-2.5">
                {journals.map((j) => (
                  <JournalRow key={j.id} journal={j} />
                ))}
              </div>
            )
          ) : projects.length === 0 ? (
            <EmptySeason kind="projects" slug={selected?.slug ?? ""} />
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="mobile-page-heading">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Past Seasons
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your work from earlier seasons. Read-only.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-selected={active}
      role="tab"
      className={cn(
        "flex items-center gap-1.5 border-b-[3px] px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      <span className="text-xs text-muted-foreground">({count})</span>
    </button>
  );
}

/** One week. Collapsed to its headline, expanding to the full entry. */
function JournalRow({ journal }: { journal: ArchiveJournal }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden border-[#EAE1D9] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            {journal.weekNumber != null
              ? `Week ${journal.weekNumber}`
              : "Week"}{" "}
            · {formatDate(journal.weekStartDate)}
          </span>
          {!open ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {journal.whatWeDid || "No entry recorded"}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {journal.submittedAt ? (
            <span className="rounded-full bg-[#E8F7EE] px-2 py-0.5 text-[10px] font-semibold text-[#15744B]">
              Submitted
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t bg-[#FCFAF7] px-4 py-3.5">
          <Field label="What we did" value={journal.whatWeDid} />
          <Field label="Blockers" value={journal.blockers} />
          <Field label="Next week's plan" value={journal.nextWeekPlan} />
        </div>
      ) : null}
    </Card>
  );
}

function ProjectCard({ project }: { project: ArchiveProject }) {
  return (
    <Card className="border-[#EAE1D9] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{project.title}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatINR(project.verifiedRevenue)} verified
            {project.serviceCategory ? ` · ${project.serviceCategory}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
            project.status === "verified" || project.status === "completed"
              ? "bg-[#E8F7EE] text-[#15744B]"
              : "bg-muted text-muted-foreground",
          )}
        >
          {project.status}
        </span>
      </div>

      {project.problemStatement || project.solutionDescription ? (
        <div className="mt-3 space-y-3 border-t pt-3">
          <Field label="Business problem" value={project.problemStatement} />
          <Field label="Solution" value={project.solutionDescription} />
        </div>
      ) : null}
    </Card>
  );
}

/** One labelled block of recorded prose. Renders nothing when empty. */
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
        {value}
      </p>
    </div>
  );
}

function EmptySeason({ kind, slug }: { kind: string; slug: string }) {
  return (
    <Card className="border-dashed bg-white p-10 text-center">
      <h2 className="text-base font-semibold">
        Nothing recorded in Season {slug}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your team has no {kind} from this season.
      </p>
    </Card>
  );
}
