import { customFetch } from "@workspace/api-client-react";

export type JournalSubmissionsLockState = {
  locked: boolean;
  message: string;
  seasonId: number;
};

export function getJournalSubmissionsLock(): Promise<JournalSubmissionsLockState> {
  return customFetch<JournalSubmissionsLockState>(
    "/api/journal-submissions-lock",
    { method: "GET" },
  );
}

export function saveJournalSubmissionsLock(body: {
  locked: boolean;
  message: string | null;
}): Promise<JournalSubmissionsLockState> {
  return customFetch<JournalSubmissionsLockState>(
    "/api/admin/journal-submissions-lock",
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}