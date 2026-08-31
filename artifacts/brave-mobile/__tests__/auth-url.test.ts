import {
  isAuthCallbackUrl,
  tokenFromAuthCallback,
} from '../src/lib/auth-url';
import { buildFormsLoginUrl, REDIRECT_URI } from '../src/lib/config';

describe('Forms SSO URLs', () => {
  test('builds the Forms login URL with the native callback', () => {
    const url = new URL(buildFormsLoginUrl());
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://forms.ccbp.in/mid/brave-dashboard',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
  });

  test.each([
    ['in.niatindia.brave://auth?auth_token=abc', 'abc'],
    ['in.niatindia.brave://auth#auth_token=xyz', 'xyz'],
    ['in.niatindia.brave://auth/#auth_token=xyz', 'xyz'],
  ])('accepts an exact native callback', (url, token) => {
    expect(isAuthCallbackUrl(url)).toBe(true);
    expect(tokenFromAuthCallback(url)).toBe(token);
  });

  test.each([
    'https://dashboard.brave.niatindia.com/auth?auth_token=abc',
    'in.niatindia.brave://authentication?auth_token=abc',
    'in.niatindia.brave://auth/extra?auth_token=abc',
    'not a url',
  ])('rejects an unexpected callback: %s', url => {
    expect(isAuthCallbackUrl(url)).toBe(false);
    expect(tokenFromAuthCallback(url)).toBeNull();
  });
});