// Frontend API helper for admin-managed student pop-ups.
// Hand-written (bypasses Orval codegen), same pattern as terms-api /
// grit-config-api. Admins CRUD templates from Config; students fetch pending
// popups and acknowledge them. Entirely separate from the Terms & Conditions
// gate.
import { customFetch } from "@workspace/api-client-react";

export type PopupTemplate = {
  id: number;
  name: string;
  message: string;
  requireCheckbox: boolean;
  checkboxLabel: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  acknowledgedCount: number;
};

export type PendingPopup = {
  id: number;
  name: string;
  message: string;
  requireCheckbox: boolean;
  checkboxLabel: string | null;
};

export type PopupInput = {
  name: string;
  message: string;
  requireCheckbox: boolean;
  checkboxLabel?: string | null;
  enabled: boolean;
};

// ---------- Admin ----------
export function listPopups(): Promise<PopupTemplate[]> {
  return customFetch<PopupTemplate[]>("/api/admin/popups");
}

export function createPopup(input: PopupInput): Promise<PopupTemplate> {
  return customFetch<PopupTemplate>("/api/admin/popups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePopup(
  id: number,
  input: Partial<PopupInput>,
): Promise<PopupTemplate> {
  return customFetch<PopupTemplate>(`/api/admin/popups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePopup(id: number): Promise<null> {
  return customFetch<null>(`/api/admin/popups/${id}`, { method: "DELETE" });
}

// ---------- Student ----------
export function fetchPendingPopups(): Promise<PendingPopup[]> {
  return customFetch<PendingPopup[]>("/api/popups/pending");
}

export function ackPopup(id: number): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>(`/api/popups/${id}/ack`, {
    method: "POST",
  });
}
