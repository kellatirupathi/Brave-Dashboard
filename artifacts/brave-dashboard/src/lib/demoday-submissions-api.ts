// Frontend API helpers for the new Demo Day "best project" submissions.
// Hand-written (bypasses Orval codegen), same pattern as grit-config-api /
// progress-api. Isolated from the legacy Demo Day application flow.
import { customFetch } from "@workspace/api-client-react";

export type DemoDaySubmissionStatus = "submitted" | "shortlisted" | "rejected";

export type DemoDaySubmission = {
  id: number;
  teamId: number;
  projectId: number | null;
  title: string;
  description: string;
  link: string | null;
  fileUrl: string | null;
  status: DemoDaySubmissionStatus;
  submittedBy: string;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched fields added by the server.
  teamName: string;
  campusId: number | null;
  totalRevenue: number;
};

export type DemoDaySubmissionInput = {
  projectId?: number | null;
  title: string;
  description: string;
  link?: string | null;
  fileUrl?: string | null;
};

// Student: read own team's submission (null if none yet).
export function getMyDemoDaySubmission(): Promise<DemoDaySubmission | null> {
  return customFetch<DemoDaySubmission | null>("/api/demo-day/submission");
}

// Student: create or update (upsert) own team's submission.
export function saveDemoDaySubmission(
  body: DemoDaySubmissionInput,
): Promise<DemoDaySubmission> {
  return customFetch<DemoDaySubmission>("/api/demo-day/submission", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Admin: list all submissions.
export function listDemoDaySubmissions(): Promise<DemoDaySubmission[]> {
  return customFetch<DemoDaySubmission[]>("/api/admin/demo-day/submissions");
}

// Admin: update status / review note.
export function reviewDemoDaySubmission(
  id: number,
  body: { status?: DemoDaySubmissionStatus; reviewNote?: string | null },
): Promise<DemoDaySubmission> {
  return customFetch<DemoDaySubmission>(
    `/api/admin/demo-day/submissions/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}
