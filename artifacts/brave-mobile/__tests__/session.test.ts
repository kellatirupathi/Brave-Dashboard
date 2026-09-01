import CookieManager from '@preeternal/react-native-cookie-manager';
import * as Keychain from 'react-native-keychain';
import {
  adoptSessionFromCookies,
  extractSessionId,
} from '../src/lib/session';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'AfterFirstUnlock' },
  setGenericPassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: {
    flush: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    getCookieHeader: jest.fn().mockResolvedValue(''),
  },
}));

describe('session cookie parsing', () => {
  test('extracts the sid from a single cookie header', () => {
    expect(
      extractSessionId('sid=session-123; Path=/; HttpOnly; Secure'),
    ).toBe('session-123');
  });

  test('extracts sid when multiple cookies and an expiry comma are present', () => {
    expect(
      extractSessionId(
        'other=x; Expires=Wed, 09 Jun 2027 10:18:14 GMT, sid=abc.def; Path=/',
      ),
    ).toBe('abc.def');
  });

  test('does not match a cookie whose name only ends with sid', () => {
    expect(extractSessionId('other_sid=wrong; Path=/')).toBeNull();
  });

  test('waits for Android to flush a newly-created sid cookie', async () => {
    const get = CookieManager.get as jest.MockedFunction<
      typeof CookieManager.get
    >;
    get
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ sid: { name: 'sid', value: 'delayed-session' } });

    await expect(
      adoptSessionFromCookies('https://dashboard.brave.niatindia.com/dashboard'),
    ).resolves.toBe('delayed-session');
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'sid',
      'delayed-session',
      expect.objectContaining({
        service: 'in.niatindia.brave.session',
      }),
    );
  });
});