// Frontend helpers for the projects submissions lock (admin Config toggle
// that pauses student order-book/BRD submissions on the Projects pages).
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts
// helpers.
import { customFetch } from "@workspace/api-client-react";

export type ProjectsLock = {
  locked: boolean;
  message: string;
  rejectedResubmitEnabled: boolean;
  // When false, the "Request to submit" button is hidden from the lock banner
  // (team leaders can no longer file a request).
  submissionRequestEnabled: boolean;
  // True when the CURRENT user's team is exempted from the global lock (or the
  // user is an admin). An exempted team can submit normally, no banner. Only
  // returned by GET /projects-lock (not the admin PUT response).
  exempted?: boolean;
};

export function getProjectsLock(): Promise<ProjectsLock> {
  return customFetch<ProjectsLock>("/api/projects-lock", { method: "GET" });
}

export function saveProjectsLock(input: {
  locked?: boolean;
  message?: string | null;
  rejectedResubmitEnabled?: boolean;
  submissionRequestEnabled?: boolean;
}): Promise<ProjectsLock> {
  return customFetch<ProjectsLock>("/api/admin/projects-lock", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
