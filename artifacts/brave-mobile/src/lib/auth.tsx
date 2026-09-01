/**
 * Authentication: sign in once, stay signed in.
 *
 * THE FLOW
 *   1. Open the NIAT Forms SSO in a Chrome Custom Tab, telling it to come back
 *      to `in.niatindia.brave://auth`.
 *   2. The SSO returns that deep link carrying a one-time `auth_token`.
 *   3. Exchange it at `/api/auth/validate-token`, which answers with a `sid`
 *      session cookie.
 *   4. Put `sid` in the Keystore.
 *   5. On every later launch, skip 1-3 entirely: load `sid` and ask
 *      `/api/auth/user` who it belongs to. A student sees the Dashboard.
 *
 * ABOUT THE BROWSER
 * Step 1 has to leave the app, and that is not a limitation of React Native.
 * Android forbids an app from rendering a third party's login inside its own
 * views — it is the rule that stops a malicious app drawing a fake NIAT login
 * and harvesting passwords. `openAuth` uses a Custom Tab, which is the
 * sanctioned path: it shares Chrome's cookie jar (so a student already signed
 * in to NIAT may not have to type anything), and it closes ITSELF the moment
 * the deep link fires.
 *
 * Because of step 5 this happens once a week at most, not once a launch.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE } from './config';
import { isAuthCallbackUrl, tokenFromAuthCallback } from './auth-url';
import { api, setUnauthorizedHandler, UnauthorizedError } from './api';
import { WebLoginModal, WebLoginResult } from '../screens/WebLoginModal';
import {
  adoptSessionFromCookies,
  saveSessionId,
  loadSessionId,
  clearSession,
  extractSessionId,
  COOKIE_NAME,
} from './session';

export type User = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  campusId?: number | null;
  teamId?: number | null;
  profileImageUrl?: string | null;
};

type AuthState = {
  user: User | null;
  /** True only while the app is deciding whether a stored session is valid. */
  restoring: boolean;
  /** True while an interactive sign-in is in flight. */
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

class TokenExchangeError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * Trade the one-time token for a durable session and remember it.
 * Done with raw fetch because this is the one call that must read a response
 * HEADER rather than the body.
 */
async function exchangeToken(token: string): Promise<User | null> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/validate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new TokenExchangeError(
      'Could not verify sign-in. Check your connection and try again.',
      true,
    );
  }

  if (res.status === 401) {
    throw new TokenExchangeError(
      'This sign-in link has expired. Please sign in again.',
      false,
    );
  }
  if (!res.ok) {
    throw new TokenExchangeError(
      'NIAT sign-in is temporarily unavailable. Please try again.',
      true,
    );
  }

  const sid = extractSessionId(res.headers.get('set-cookie'));
  if (!sid) {
    throw new TokenExchangeError(
      'Sign-in completed, but the session could not be saved. Please try again.',
      true,
    );
  }
  await saveSessionId(sid);

  const body = (await res.json()) as { user: User | null };
  return body.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webLoginOpen, setWebLoginOpen] = useState(false);
  const inFlightTokens = useRef(new Set<string>());
  const completedTokens = useRef(new Set<string>());
  const queryClient = useQueryClient();

  const expireSession = useCallback(() => {
    queryClient.clear();
    setUser(null);
    setSigningIn(false);
    setError('Your session expired. Please sign in again.');
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(expireSession);
    return () => setUnauthorizedHandler(null);
  }, [expireSession]);

  /** Cold start: is there a session worth reusing? */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sid = await loadSessionId();
        if (!sid) return;
        const body = await api.get<{ user: User | null }>('/api/auth/user');
        if (!cancelled && body.user) setUser(body.user);
        // A stored id the server no longer honours is dead weight — drop it so
        // the next launch does not pay for the round trip again.
        else if (!cancelled) await clearSession();
      } catch (err) {
        if (err instanceof UnauthorizedError) await clearSession();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = useCallback(async (url: string) => {
    const token = tokenFromAuthCallback(url);
    if (!token) {
      setError('Sign-in did not complete. Please try again.');
      return;
    }
    // openAuth and Linking can both receive the same callback. Forms tokens
    // are single-use, so exchanging twice makes a successful login look like
    // a failure when the second request loses the race.
    if (
      inFlightTokens.current.has(token) ||
      completedTokens.current.has(token)
    ) {
      return;
    }
    inFlightTokens.current.add(token);
    try {
      const u = await exchangeToken(token);
      if (!u) {
        throw new TokenExchangeError(
          'We could not verify that sign-in. Please try again.',
          false,
        );
      }
      completedTokens.current.add(token);
      queryClient.clear();
      setUser(u);
      setError(null);
    } catch (exchangeError) {
      if (
        exchangeError instanceof TokenExchangeError &&
        !exchangeError.retryable
      ) {
        completedTokens.current.add(token);
      }
      setError(
        exchangeError instanceof TokenExchangeError
          ? exchangeError.message
          : 'We could not verify that sign-in. Please try again.',
      );
    } finally {
      inFlightTokens.current.delete(token);
    }
  }, [queryClient]);

  /**
   * A deep link can also arrive when the Custom Tab hands off to the OS rather
   * than resolving inside `openAuth` — for instance if the SSO bounces through
   * an external identity provider.
   */
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (isAuthCallbackUrl(url)) void finish(url);
    });
    // When Android or iOS launches a stopped app from the SSO callback, there
    // is no live event listener yet. Recover that initial deep link here.
    void Linking.getInitialURL().then(url => {
      if (url && isAuthCallbackUrl(url)) void finish(url);
    });
    return () => sub.remove();
  }, [finish]);

  /**
   * Open the in-app login.
   *
   * This no longer hands the student to a Chrome Custom Tab. Forms decides its
   * own post-login destination — its contract has no callback field — so a
   * sealed browser tab had no way to tell us anything. The WebView below is our
   * own view, and `resolveWebLogin` reads the answer out of it directly.
   */
  const signIn = useCallback(async () => {
    setError(null);
    setWebLoginOpen(true);
  }, []);

  /** Called by the login WebView once it knows how the attempt ended. */
  const resolveWebLogin = useCallback(
    async (result: WebLoginResult) => {
      setWebLoginOpen(false);
      if (result.kind === 'cancelled') return; // backed out; not an error

      setSigningIn(true);
      try {
        if (result.kind === 'token') {
          await finish(result.url);
          return;
        }

        // No token in the URL, so take the session out of the cookie jar. The
        // dashboard has already set `sid` if the login succeeded.
        const sid = await adoptSessionFromCookies(API_BASE);
        if (!sid) {
          setError('Sign-in did not complete. Please try again.');
          return;
        }
        const body = await api.get<{ user: User | null }>('/api/auth/user');
        if (body.user) {
          queryClient.clear();
          setUser(body.user);
          setError(null);
        } else {
          // A cookie the server will not honour is worse than none: it would
          // make the next launch look signed in and then fail everywhere.
          await clearSession();
          setError('Sign-in did not complete. Please try again.');
        }
      } catch {
        setError('We could not verify that sign-in. Please try again.');
      } finally {
        setSigningIn(false);
      }
    },
    [finish, queryClient],
  );

  const signOut = useCallback(async () => {
    const sid = await loadSessionId();
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: 'GET',
        headers: sid ? { Cookie: `${COOKIE_NAME}=${sid}` } : undefined,
      });
    } catch {
      /* the local session is cleared regardless */
    }
    await clearSession();
    queryClient.clear();
    setUser(null);
    setError(null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, restoring, signingIn, error, signIn, signOut }),
    [user, restoring, signingIn, error, signIn, signOut],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {/*
        Lives here rather than on the login screen so it survives a session
        expiring mid-use: any screen can trigger a re-login without unmounting.
      */}
      <WebLoginModal visible={webLoginOpen} onResolve={resolveWebLogin} />
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
