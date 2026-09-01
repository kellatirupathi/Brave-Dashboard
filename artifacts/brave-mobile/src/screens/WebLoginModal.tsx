/**
 * Sign-in, in a WebView the app owns.
 *
 * WHY THIS EXISTS
 * The Custom Tab approach could never finish. NxtWave Forms decides where the
 * browser goes after a successful login — its `generate-token` contract takes
 * a `user_id` and nothing else, so there is no callback field for us to set and
 * the `redirect_uri` we appended was simply ignored. The tab landed on the
 * website and the app was never told anything.
 *
 * A Custom Tab is a sealed box: the app cannot see which page it is on, which
 * is exactly why it needs a deep link to get an answer back. A WebView is OUR
 * view. We watch every navigation and read the cookie jar directly, so nothing
 * has to be redirected anywhere.
 *
 * TWO WAYS HOME, because we cannot be sure which one Forms gives us
 *   1. The landing URL carries `?auth_token=…` — exchange it.
 *   2. The dashboard sets its `sid` cookie once the session exists — adopt it.
 *
 * (2) is the sturdier of the two: it does not care how the session came about,
 * only that it is there. That is what makes this independent of NxtWave.
 *
 * ON EMBEDDING A LOGIN IN A WEBVIEW
 * Defensible here, and only here: this is the organisation's OWN identity
 * provider, on a domain NIAT controls, inside NIAT's own app. The rule against
 * it exists to stop apps phishing credentials for a THIRD party — which is why
 * Google and Apple refuse to load their sign-in pages this way. If Forms ever
 * routes through one of those, this screen will show their refusal rather than
 * a login box, and the flow has to change.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { colors, space, font, elevation } from '../theme/tokens';
import { API_BASE, buildFormsLoginUrl } from '../lib/config';

export type WebLoginResult =
  | { kind: 'token'; url: string }
  | { kind: 'session' }
  | { kind: 'cancelled' };

/** Host of the dashboard, so we can tell "we are home" from "still at Forms". */
const API_HOST = (() => {
  try {
    return new URL(API_BASE).host;
  } catch {
    return 'dashboard.brave.niatindia.com';
  }
})();

function isDashboardUrl(url: string): boolean {
  try {
    return new URL(url).host === API_HOST;
  } catch {
    return false;
  }
}

function hasAuthToken(url: string): boolean {
  return /[?#&]auth_token=/.test(url);
}

export function WebLoginModal({
  visible,
  onResolve,
}: {
  visible: boolean;
  /** Called once, with whatever we managed to recover. */
  onResolve: (result: WebLoginResult) => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Sign in with NIAT');
  /**
   * A login can produce several navigations to our own domain in a row
   * (redirect, then the SPA's own routing). Resolving more than once would
   * exchange a single-use token twice and turn a success into an error.
   */
  const settled = useRef(false);

  const handleNavigation = useCallback(
    (nav: WebViewNavigation) => {
      if (settled.current) return;
      const { url } = nav;
      if (!url || !isDashboardUrl(url)) return;

      // Route 1 — the token is in the URL. Cheapest and most explicit.
      if (hasAuthToken(url)) {
        settled.current = true;
        onResolve({ kind: 'token', url });
        return;
      }

      // Route 2 — we are on the dashboard and the page has finished loading,
      // so if a session exists the cookie is now in the jar. `loading` is
      // false only after onLoadEnd, which is what makes this safe to check.
      if (!nav.loading) {
        settled.current = true;
        onResolve({ kind: 'session' });
      }
    },
    [onResolve],
  );

  const cancel = useCallback(() => {
    if (settled.current) return;
    settled.current = true;
    onResolve({ kind: 'cancelled' });
  }, [onResolve]);

  // Reset between openings, so a second attempt is not dead on arrival.
  React.useEffect(() => {
    if (visible) {
      settled.current = false;
      setLoading(true);
      setTitle('Sign in with NIAT');
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={cancel}
      statusBarTranslucent={false}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.bar}>
          <Pressable
            onPress={cancel}
            hitSlop={12}
            android_ripple={{
              color: 'rgba(255,255,255,0.2)',
              borderless: true,
              radius: 22,
            }}
            style={s.close}
            accessibilityLabel="Cancel sign-in"
          >
            <X size={22} color={colors.chromeForeground} />
          </Pressable>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {loading ? (
          <View style={s.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loaderText}>Opening NIAT sign-in…</Text>
          </View>
        ) : null}

        {visible ? (
          <WebView
            source={{ uri: buildFormsLoginUrl() }}
            style={loading ? s.hidden : s.web}
            onNavigationStateChange={handleNavigation}
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            // The session cookie is the whole point, so third-party cookies
            // must be allowed; Forms and the dashboard are different origins.
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            // Some providers serve a cut-down page to anything that looks like
            // an in-app browser. Present as ordinary Chrome.
            userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            onLoadProgress={({ nativeEvent }) => {
              if (nativeEvent.title) setTitle(nativeEvent.title);
            }}
            startInLoadingState={false}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
    backgroundColor: colors.chrome,
    ...elevation(2),
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  title: {
    ...font.heading,
    fontSize: 17,
    color: colors.chromeForeground,
    flex: 1,
    marginLeft: space.sm,
  },
  web: { flex: 1, backgroundColor: colors.background },
  // Kept mounted but off-screen while loading, so the page is already parsed
  // by the time it is revealed.
  hidden: { flex: 1, opacity: 0, backgroundColor: colors.background },
  loader: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loaderText: {
    ...font.caption,
    color: colors.mutedForeground,
    marginTop: space.md,
  },
});
