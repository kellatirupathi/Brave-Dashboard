/**
 * Sign in.
 *
 * The website opens on a marketing landing page — hero copy, a feature grid, an
 * animated revenue chart. That is right for somebody arriving from a link who
 * needs convincing. It is wrong for somebody who tapped a BRAVE icon on their
 * own home screen: they have already decided.
 *
 * So the app opens straight here. One mark, one line, one button.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';
import { colors, space, radius, font, elevation } from '../theme/tokens';
import { Button, Caption } from '../components/ui';
import { useAuth } from '../lib/auth';

export function LoginScreen() {
  const { signIn, signingIn, error } = useAuth();
  const insets = useSafeAreaInsets();

  // A staged entrance: the mark settles, then the words, then the button.
  // Native apps almost never snap their first frame into place, and the
  // difference between "appeared" and "arrived" is most of what makes a launch
  // feel considered.
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [rise]);

  const stage = (delay: number) => ({
    opacity: rise.interpolate({
      inputRange: [delay, Math.min(delay + 0.45, 1)],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: rise.interpolate({
          inputRange: [delay, Math.min(delay + 0.45, 1)],
          outputRange: [18, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  });

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      <View style={[s.hero, { paddingTop: insets.top + space.xxxl * 2 }]}>
        <Animated.View style={stage(0)}>
          <View style={s.mark}>
            <Text style={s.markText}>
              BRAVE<Text style={s.markDot}>.</Text>
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[stage(0.2), { marginTop: space.xl }]}>
          <Text style={s.tagline}>Build something real.</Text>
          <Text style={s.sub}>
            Your ventures, your journal and your team — in one place.
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        style={[
          s.sheet,
          stage(0.4),
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <Button
          label={signingIn ? 'Opening sign-in…' : 'Sign in with NIAT'}
          onPress={signIn}
          loading={signingIn}
        />

        {error ? (
          <View style={s.error}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.note}>
          <ShieldCheck size={15} color={colors.mutedForeground} />
          <Caption style={{ marginLeft: space.sm, flex: 1 }}>
            You will sign in once. The app keeps you signed in after that.
          </Caption>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.chrome },
  hero: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  mark: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  markText: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.accentRed,
  },
  markDot: { color: colors.gold },
  tagline: {
    ...font.title,
    color: colors.chromeForeground,
    textAlign: 'center',
  },
  sub: {
    ...font.body,
    color: 'rgba(253,249,237,0.72)',
    textAlign: 'center',
    marginTop: space.sm,
    maxWidth: 300,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl + 8,
    borderTopRightRadius: radius.xl + 8,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    ...elevation(3),
  },
  error: {
    marginTop: space.lg,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: space.md,
  },
  errorText: { ...font.caption, color: colors.danger, textAlign: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.xs,
  },
});
