// Season 2 pipeline gate mode, hand-written (bypasses Orval codegen).
//
// The gates (A: trail before convert, B: converted lead before project,
// C: checklist before BRD submit) are always evaluated and shown. This flag
// decides whether they also BLOCK. Default is advisory.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type PipelineGates = { enforced: boolean };

export const PIPELINE_GATES_KEY = ["pipeline-gates"] as const;

export function getPipelineGates(): Promise<PipelineGates> {
  return customFetch<PipelineGates>("/api/pipeline/gates", { method: "GET" });
}

export function updatePipelineGates(body: PipelineGates): Promise<PipelineGates> {
  return customFetch<PipelineGates>("/api/admin/pipeline/gates", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Whether the gates block right now. Resolves to advisory (false) while
 * loading or on error, mirroring the server's fail-open — a UI that wrongly
 * enables a button just gets the server's 409 with a clear message, whereas a
 * UI that wrongly disables one strands the student.
 */
export function usePipelineGatesEnforced(): boolean {
  const q = useQuery({
    queryKey: PIPELINE_GATES_KEY,
    queryFn: getPipelineGates,
    staleTime: 60_000,
    retry: false,
  });
  return q.data?.enforced ?? false;
}

export function useInvalidatePipelineGates(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: PIPELINE_GATES_KEY });
  };
}
