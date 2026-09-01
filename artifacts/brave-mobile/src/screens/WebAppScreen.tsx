import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { API_BASE } from '../lib/config';
import { colors, font, radius, space } from '../theme/tokens';

// react-native-webview 14's generic class declaration is not yet compatible
// with TypeScript 6 refs. Its runtime props remain the standard WebView props.
const AppWebView = WebView as React.ComponentType<any>;

/**
 * The NIAT sign-in and the authenticated BRAVE dashboard deliberately live in
 * one persistent WebView. The dashboard's HTTP-only session cookie therefore
 * never has to cross from Android WebView storage into React Native.
 */
export function WebAppScreen() {
  const insets = useSafeAreaInsets();
  const webView = useRef<any>(null);
  const hasLoadedPage = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack) return false;
        webView.current?.goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack]);

  const navigationChanged = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  const retry = useCallback(() => {
    hasLoadedPage.current = false;
    setFailed(false);
    setLoading(true);
    setReloadKey(value => value + 1);
  }, []);

  const openRequest = useCallback((request: { url: string }) => {
    if (/^https?:\/\//i.test(request.url)) return true;
    Linking.openURL(request.url).catch(() => undefined);
    return false;
  }, []);

  const showFailure = useCallback(() => {
    setLoading(false);
    setFailed(true);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      <AppWebView
        key={reloadKey}
        ref={webView}
        // This is the same server-side login used by the working web app:
        // /api/login -> Replit OIDC -> /api/callback -> dashboard sid cookie.
        // Do not use the Forms OTP URL here; it has no native callback contract.
        source={{ uri: `${API_BASE}/api/login` }}
        style={styles.web}
        onNavigationStateChange={navigationChanged}
        onLoadStart={() => {
          // OTP and OIDC can navigate or submit without completing another
          // document load. Never put the full-screen loader back over that UI.
          if (!hasLoadedPage.current) setLoading(true);
          setFailed(false);
        }}
        onLoadEnd={() => {
          hasLoadedPage.current = true;
          setLoading(false);
        }}
        onError={showFailure}
        onHttpError={({ nativeEvent }: { nativeEvent: { statusCode: number } }) => {
          if (!hasLoadedPage.current && nativeEvent.statusCode >= 500) {
            setFailed(true);
          }
        }}
        onShouldStartLoadWithRequest={openRequest}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        startInLoadingState={false}
        userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
      />

      {!hasLoadedPage.current && loading && !failed ? (
        <View style={styles.overlay}>
          <Text style={styles.logo}>
            BRAVE<Text style={styles.dot}>.</Text>
          </Text>
          <ActivityIndicator
            style={styles.spinner}
            size="large"
            color={colors.primary}
          />
          <Text style={styles.status}>Opening your BRAVE workspace…</Text>
        </View>
      ) : null}

      {failed ? (
        <View style={styles.overlay}>
          <Text style={styles.logo}>
            BRAVE<Text style={styles.dot}>.</Text>
          </Text>
          <Text style={styles.errorTitle}>Could not open BRAVE</Text>
          <Text style={styles.errorBody}>
            Check your internet connection, then try again.
          </Text>
          <Pressable style={styles.retry} onPress={retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome },
  web: { flex: 1, backgroundColor: colors.background },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    backgroundColor: colors.background,
  },
  logo: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.accentRed,
  },
  dot: { color: colors.gold },
  spinner: { marginTop: space.xl },
  status: {
    ...font.body,
    marginTop: space.md,
    color: colors.mutedForeground,
  },
  errorTitle: {
    ...font.heading,
    marginTop: space.xl,
    color: colors.foreground,
  },
  errorBody: {
    ...font.body,
    marginTop: space.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  retry: {
    marginTop: space.xl,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  retryText: { ...font.heading, color: colors.white },
});