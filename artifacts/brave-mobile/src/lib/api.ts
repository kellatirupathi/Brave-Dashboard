/**
 * The one place the app talks to the server.
 *
 * Cookies are attached BY HAND rather than left to the platform. React Native's
 * Android networking (OkHttp) keeps its own cookie jar, but it is in-memory and
 * cleared with the process — relying on it is precisely the bug that made the
 * old app ask for a login on every launch. Here the session id comes from the
 * Keystore and is set explicitly on every request.
 */
import { API_BASE } from './config';
import { clearSession, loadSessionId, COOKIE_NAME } from './session';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * AuthProvider registers this once so an expired server session immediately
 * returns the app to sign-in, even when the 401 came from a screen query.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Thrown when the session is gone; the UI reacts by returning to sign-in. */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Session expired') {
    super(401, message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  seasonId?: number,
): Promise<T> {
  const sid = await loadSessionId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (sid) headers.Cookie = `${COOKIE_NAME}=${sid}`;
  // Mirrors the web app's season precedence: an explicit header wins, so the
  // app shows the same season the student last chose.
  if (seasonId != null) headers['x-brave-season'] = String(seasonId);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    await clearSession();
    unauthorizedHandler?.();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* not JSON — keep the status message */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, seasonId?: number) => request<T>(path, {}, seasonId),
  post: <T>(path: string, body?: unknown, seasonId?: number) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }, seasonId),
  patch: <T>(path: string, body?: unknown, seasonId?: number) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }, seasonId),
  del: <T>(path: string, seasonId?: number) => request<T>(path, { method: 'DELETE' }, seasonId),
};
