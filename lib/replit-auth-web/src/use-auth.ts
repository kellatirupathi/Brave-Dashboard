import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const importMetaEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env ?? {};

const FORMS_LOGIN_URL = importMetaEnv.VITE_FORMS_LOGIN_URL;

// ---- Module-level shared store ----------------------------------------------
// Every useAuth() call subscribes to the same store, so refreshing the user
// (e.g. after team creation) instantly updates every consumer — sidebar,
// dashboard, page components — without a page reload.

interface Snapshot {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

let snapshot: Snapshot = { user: null, isLoading: true, error: null };
const listeners = new Set<() => void>();

function setSnapshot(next: Snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function getSnapshot() {
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// In-flight fetch deduplication so concurrent callers (mount + refresh) share
// a single network request.
let inFlight: Promise<void> | null = null;

async function fetchAuthUser(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { user: AuthUser | null };
      const user = data.user?.id != null ? data.user : null;
      setSnapshot({ user, isLoading: false, error: null });
    } catch {
      setSnapshot({ user: null, isLoading: false, error: snapshot.error });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  const params = new URLSearchParams(window.location.search);
  const token = params.get("auth_token");

  const stripToken = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_token");
    window.history.replaceState(
      {},
      "",
      url.pathname + (url.search ? url.search : "") + url.hash,
    );
  };

  if (token) {
    fetch("/api/auth/validate-token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        stripToken();
        const user = data.user?.id != null ? data.user : null;
        setSnapshot({ user, isLoading: false, error: null });
      })
      .catch(() => {
        stripToken();
        setSnapshot({ user: null, isLoading: false, error: "Sign-in failed. Please try again." });
      });
    return;
  }

  void fetchAuthUser();
}

export function useAuth(): AuthState {
  // Lazily kick off the first fetch on the first render of the first consumer.
  ensureInitialized();

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const login = useCallback(() => {
    if (!FORMS_LOGIN_URL) {
      setSnapshot({ ...snapshot, error: "Login URL not configured." });
      return;
    }
    window.location.href = FORMS_LOGIN_URL;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  const refresh = useCallback(async () => {
    await fetchAuthUser();
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: !!state.user,
    error: state.error,
    login,
    logout,
    refresh,
  };
}

// Allow non-hook callers to trigger a refresh imperatively if needed.
export async function refreshAuth(): Promise<void> {
  await fetchAuthUser();
}
