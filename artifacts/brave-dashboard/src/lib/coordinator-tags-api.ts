// Frontend API helpers for the Coordinator Tags feature.
// Hand-written on purpose (bypasses Orval/OpenAPI codegen) — this is an
// isolated additive feature, same pattern as progress-api / membership-api.
import { customFetch } from "@workspace/api-client-react";

export type CoordinatorTag = {
  id: number;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

// userId -> the tags currently assigned to that coordinator.
export type CoordinatorTagAssignments = Record<
  string,
  { id: number; name: string }[]
>;

export function listCoordinatorTags(): Promise<CoordinatorTag[]> {
  return customFetch<{ items: CoordinatorTag[] }>(
    "/api/admin/coordinator-tags",
  ).then((r) => r.items);
}

export function createCoordinatorTag(name: string): Promise<CoordinatorTag> {
  return customFetch<CoordinatorTag>("/api/admin/coordinator-tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameCoordinatorTag(
  id: number,
  name: string,
): Promise<CoordinatorTag> {
  return customFetch<CoordinatorTag>(`/api/admin/coordinator-tags/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteCoordinatorTag(id: number): Promise<{ ok: true }> {
  return customFetch<{ ok: true }>(`/api/admin/coordinator-tags/${id}`, {
    method: "DELETE",
  });
}

export function getCoordinatorTagAssignments(): Promise<CoordinatorTagAssignments> {
  return customFetch<{ assignments: CoordinatorTagAssignments }>(
    "/api/admin/coordinator-tags/assignments",
  ).then((r) => r.assignments);
}

export function getUserCoordinatorTagIds(userId: string): Promise<number[]> {
  return customFetch<{ tagIds: number[] }>(
    `/api/admin/users/${userId}/coordinator-tags`,
  ).then((r) => r.tagIds);
}

export function setUserCoordinatorTags(
  userId: string,
  tagIds: number[],
): Promise<{ ok: true; tagIds: number[] }> {
  return customFetch<{ ok: true; tagIds: number[] }>(
    `/api/admin/users/${userId}/coordinator-tags`,
    { method: "PUT", body: JSON.stringify({ tagIds }) },
  );
}
