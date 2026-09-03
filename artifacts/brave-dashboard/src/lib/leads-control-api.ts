import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export const LEADS_CONTROL_SECTIONS = [
  "leads",
  "projects",
  "phases",
  "payments",
  "interactions",
] as const;

export type LeadsControlSection = (typeof LEADS_CONTROL_SECTIONS)[number];
export type LeadsControlAction = "add" | "edit" | "delete";
export type LeadsSectionPermissions = Record<LeadsControlAction, boolean>;
export type LeadsControlPermissions = Record<
  LeadsControlSection,
  LeadsSectionPermissions
> & { submitForReview: boolean };

export type LeadsControlState = {
  locked: boolean;
  message: string;
  permissions: LeadsControlPermissions;
  seasonId: number;
  /**
   * Whether THIS user may write to the pipeline at all — the team leader, or
   * staff. Members read their team's leads but change nothing.
   */
  isLeadsWriter: boolean;
};

export const LEADS_CONTROL_KEY = ["leads-control"] as const;

export function getLeadsControl(): Promise<LeadsControlState> {
  return customFetch<LeadsControlState>("/api/leads-control", { method: "GET" });
}

export function saveLeadsControl(
  body: Omit<LeadsControlState, "seasonId" | "message" | "isLeadsWriter"> & {
    message: string | null;
  },
): Promise<LeadsControlState> {
  return customFetch<LeadsControlState>("/api/admin/leads-control", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function useLeadsControl() {
  const q = useQuery({
    queryKey: LEADS_CONTROL_KEY,
    queryFn: getLeadsControl,
    staleTime: 30_000,
    retry: false,
  });
  const state = q.data;
  // Assume no write access until the answer arrives, so a member never sees an
  // Add button flash and then vanish.
  const isLeadsWriter = state?.isLeadsWriter ?? false;
  return {
    ...q,
    state,
    locked: state?.locked ?? false,
    message: state?.message ?? "",
    isLeadsWriter,
    can: (section: LeadsControlSection, action: LeadsControlAction) =>
      isLeadsWriter &&
      !state?.locked &&
      (state?.permissions[section][action] ?? false),
    canSubmit:
      isLeadsWriter &&
      !state?.locked &&
      (state?.permissions.submitForReview ?? false),
  };
}

export function useInvalidateLeadsControl(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: LEADS_CONTROL_KEY });
  };
}