import { APP_SCHEME, REDIRECT_URI } from './config';

/**
 * Accept only the callback registered by the native applications. A prefix
 * check would also accept URLs such as `in.niatindia.brave://authentication`.
 */
export function isAuthCallbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === `${APP_SCHEME}:` &&
      url.hostname === 'auth' &&
      (url.pathname === '' || url.pathname === '/')
    );
  } catch {
    return false;
  }
}

/** Read the one-time Forms token from either query parameters or a fragment. */
export function tokenFromAuthCallback(value: string): string | null {
  if (!isAuthCallbackUrl(value)) return null;

  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get('auth_token');
    if (queryToken) return queryToken;

    const fragment = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    return fragment ? new URLSearchParams(fragment).get('auth_token') : null;
  } catch {
    return null;
  }
}

export function isExpectedRedirectUri(value: string): boolean {
  return value === REDIRECT_URI || value === `${REDIRECT_URI}/`;
}