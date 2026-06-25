// Frontend API helper for the Student Terms & Conditions consent gate.
// Hand-written (bypasses Orval codegen), same pattern as grit-config-api /
// coordinator-tags-api.
import { customFetch } from "@workspace/api-client-react";

export type AcceptTermsResponse = {
  ok: boolean;
  termsAcceptedAt: string;
};

export function acceptTerms(): Promise<AcceptTermsResponse> {
  return customFetch<AcceptTermsResponse>("/api/terms/accept", {
    method: "POST",
  });
}
