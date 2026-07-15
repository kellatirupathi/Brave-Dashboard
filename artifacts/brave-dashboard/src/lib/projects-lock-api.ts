// Frontend helpers for the projects submissions lock (admin Config toggle
// that pauses student order-book/BRD submissions on the Projects pages).
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts
// helpers.
import { customFetch } from "@workspace/api-client-react";

export type ProjectsLock = {
  locked: boolean;
  message: string;
};

export function getProjectsLock(): Promise<ProjectsLock> {
  return customFetch<ProjectsLock>("/api/projects-lock", { method: "GET" });
}

export function saveProjectsLock(input: {
  locked?: boolean;
  message?: string | null;
}): Promise<ProjectsLock> {
  return customFetch<ProjectsLock>("/api/admin/projects-lock", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
