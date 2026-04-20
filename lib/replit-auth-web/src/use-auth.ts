import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
}

const importMetaEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env ?? {};

const FORMS_LOGIN_URL = importMetaEnv.VITE_FORMS_LOGIN_URL;

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

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
          if (cancelled) return;
          stripToken();
          setUser(data.user?.id != null ? data.user : null);
          setError(null);
          setIsLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          stripToken();
          setUser(null);
          setError("Sign-in failed. Please try again.");
          setIsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user?.id != null ? data.user : null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    if (!FORMS_LOGIN_URL) {
      setError("Login URL not configured.");
      return;
    }
    window.location.href = FORMS_LOGIN_URL;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/api/logout";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
  };
}
