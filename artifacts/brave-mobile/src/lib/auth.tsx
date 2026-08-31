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
  useState,
} from 'react';
import { Linking } from 'react-native';
import InAppBrowser from 'react-native-inappbrowser-reborn';
import { API_BASE, REDIRECT_URI } from './config';
import { api, UnauthorizedError } from './api';
import {
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

/** Read `auth_token` from either the query string or the fragment. */
function tokenFromUrl(url: string): string | null {
  try {
    const q = url.split('?')[1]?.split('#')[0];
    if (q) {
      const fromQuery = new URLSearchParams(q).get('auth_token');
      if (fromQuery) return fromQuery;
    }
    const hash = url.split('#')[1];
    if (hash) {
      const fromHash = new URLSearchParams(hash).get('auth_token');
      if (fromHash) return fromHash;
    }
  } catch {
    /* malformed URL */
  }
  return null;
}

/**
 * Trade the one-time token for a durable session and remember it.
 * Done with raw fetch because this is the one call that must read a response
 * HEADER rather than the body.
 */
async function exchangeToken(token: string): Promise<User | null> {
  const res = await fetch(`${API_BASE}/api/auth/validate-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return null;

  const sid = extractSessionId(res.headers.get('set-cookie'));
  if (sid) await saveSessionId(sid);

  const body = (await res.json()) as { user: User | null };
  return body.user ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const token = tokenFromUrl(url);
    if (!token) {
      setError('Sign-in did not complete. Please try again.');
      return;
    }
    const u = await exchangeToken(token);
    if (u) {
      setUser(u);
      setError(null);
    } else {
      setError('We could not verify that sign-in. Please try again.');
    }
  }, []);

  /**
   * A deep link can also arrive when the Custom Tab hands off to the OS rather
   * than resolving inside `openAuth` — for instance if the SSO bounces through
   * an external identity provider.
   */
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(REDIRECT_URI)) void finish(url);
    });
    return () => sub.remove();
  }, [finish]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    const loginUrl = `${API_BASE}/api/login?redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    try {
      if (await InAppBrowser.isAvailable()) {
        const result = await InAppBrowser.openAuth(loginUrl, REDIRECT_URI, {
          showTitle: false,
          enableUrlBarHiding: true,
          enableDefaultShare: false,
          forceCloseOnRedirection: true,
          // Paint Chrome's chrome in BRAVE maroon so the hand-off is not a
          // jarring white screen in the middle of a dark-red app.
          toolbarColor: '#5C1414',
          secondaryToolbarColor: '#5C1414',
          navigationBarColor: '#5C1414',
        });
        if (result.type === 'success' && result.url) {
          await finish(result.url);
        } else if (result.type === 'cancel') {
          setError(null); // the student backed out; not an error
        }
      } else {
        // No Custom Tab provider on the device — hand it to the default
        // browser. The deep-link listener above still brings us home.
        await Linking.openURL(loginUrl);
      }
    } catch {
      setError('Could not open the sign-in page. Check your connection.');
    } finally {
      setSigningIn(false);
    }
  }, [finish]);

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
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, restoring, signingIn, error, signIn, signOut }),
    [user, restoring, signingIn, error, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
