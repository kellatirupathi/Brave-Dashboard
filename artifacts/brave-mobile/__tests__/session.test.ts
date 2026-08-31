import { extractSessionId } from '../src/lib/session';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { AFTER_FIRST_UNLOCK: 'AfterFirstUnlock' },
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
});