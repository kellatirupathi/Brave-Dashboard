// Student-facing side of the admin "Projects submissions lock" toggle.
// `useProjectsLock` reads the current lock state; `ProjectsLockBanner`
// renders the admin-configured message at the top of the Projects pages
// while locked. The API also enforces the lock server-side.
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { getProjectsLock } from "@/lib/projects-lock-api";

export function useProjectsLock(): {
  locked: boolean;
  message: string;
  // Whether students may edit + resubmit a rejected revenue entry. Defaults to
  // true (allowed) until the config loads, so buttons aren't hidden on a blip.
  rejectedResubmitEnabled: boolean;
} {
  const { data } = useQuery({
    queryKey: ["projects-lock"],
    queryFn: getProjectsLock,
    staleTime: 60_000,
  });
  return {
    locked: data?.locked ?? false,
    message: data?.message ?? "",
    rejectedResubmitEnabled: data?.rejectedResubmitEnabled ?? true,
  };
}

export function ProjectsLockBanner() {
  const { locked, message } = useProjectsLock();
  if (!locked) return null;
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
      data-testid="banner-projects-locked"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="whitespace-pre-wrap leading-relaxed">{message}</p>
    </div>
  );
}
