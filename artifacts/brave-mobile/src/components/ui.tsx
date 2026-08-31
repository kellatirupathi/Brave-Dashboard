/**
 * The shared native UI kit.
 *
 * Nothing here is a port of a shadcn/ui component. The web app's controls are
 * built for a cursor: hover states, 1px borders, tight hit areas. These are
 * built for a thumb — 48dp minimum targets, Material ripple, real elevation
 * rather than a drawn shadow, and text sized for a phone held at arm's length.
 */
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  DimensionValue,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { colors, space, radius, font, elevation } from '../theme/tokens';

/* ── Text ─────────────────────────────────────────────────────────── */

type TxtProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

const mk = (base: TextStyle) =>
  function Txt({ children, style, numberOfLines }: TxtProps) {
    return (
      <Text style={[base, style]} numberOfLines={numberOfLines}>
        {children}
      </Text>
    );
  };

export const Display = mk({ ...font.display, color: colors.foreground });
export const Title = mk({ ...font.title, color: colors.foreground });
export const Heading = mk({ ...font.heading, color: colors.foreground });
export const Body = mk({ ...font.body, color: colors.foreground });
export const BodyStrong = mk({ ...font.bodyStrong, color: colors.foreground });
export const Caption = mk({ ...font.caption, color: colors.mutedForeground });
export const Micro = mk({
  ...font.micro,
  color: colors.mutedForeground,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
});

/* ── Card ─────────────────────────────────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (!onPress) {
    return <View style={[s.card, style]}>{children}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      // A ripple bounded to the card is the Android idiom for "this whole
      // surface is one tap target".
      android_ripple={{ color: 'rgba(201,29,29,0.10)', borderless: false }}
      style={({ pressed }) => [
        s.card,
        style,
        // iOS has no ripple, so it gets a press state instead.
        pressed && Platform.OS === 'ios' ? { opacity: 0.7 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/* ── Button ───────────────────────────────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const tone =
    variant === 'primary'
      ? s.btnPrimary
      : variant === 'secondary'
      ? s.btnSecondary
      : s.btnGhost;
  const textTone =
    variant === 'primary'
      ? s.btnTextPrimary
      : variant === 'secondary'
      ? s.btnTextSecondary
      : s.btnTextGhost;

  return (
    <Pressable
      onPress={off ? undefined : onPress}
      android_ripple={
        off
          ? undefined
          : {
              color:
                variant === 'primary'
                  ? 'rgba(255,255,255,0.22)'
                  : 'rgba(201,29,29,0.12)',
            }
      }
      style={({ pressed }) => [
        s.btn,
        tone,
        off ? { opacity: 0.5 } : null,
        pressed && Platform.OS === 'ios' ? { opacity: 0.8 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.white : colors.primary}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[s.btnText, textTone, icon ? { marginLeft: space.sm } : null]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ── Badge ────────────────────────────────────────────────────────── */

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'gold';
}) {
  const map = {
    neutral: { bg: colors.muted, fg: colors.mutedForeground },
    success: { bg: colors.successBg, fg: colors.success },
    warning: { bg: colors.warningBg, fg: colors.warning },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    gold: { bg: colors.accent, fg: colors.accentForeground },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: map.bg }]}>
      <Text style={[s.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/* ── Skeleton ─────────────────────────────────────────────────────── */

/**
 * A pulsing placeholder shaped like the content that will replace it.
 *
 * Chosen over a spinner on purpose: a spinner says "something is happening
 * somewhere", while a skeleton says "a card of this size is arriving here", so
 * nothing jumps when the data lands. `useNativeDriver` keeps the pulse on the
 * UI thread, so it stays smooth while JSON is being parsed on the JS thread.
 */
export function Skeleton({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: radius.sm,
          backgroundColor: colors.muted,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={s.empty}>
      {icon ? <View style={s.emptyIcon}>{icon}</View> : null}
      <Heading style={{ textAlign: 'center' }}>{title}</Heading>
      {message ? (
        <Caption
          style={{ textAlign: 'center', marginTop: space.sm, maxWidth: 300 }}
        >
          {message}
        </Caption>
      ) : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

/* ── Divider ──────────────────────────────────────────────────────── */

export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: 1, backgroundColor: colors.border }, style]} />
);

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    ...elevation(1),
  },
  btn: {
    minHeight: 48, // Material's minimum comfortable touch target.
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnPrimary: { backgroundColor: colors.accentRed, ...elevation(1) },
  btnSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { ...font.bodyStrong },
  btnTextPrimary: { color: colors.white },
  btnTextSecondary: { color: colors.foreground },
  btnTextGhost: { color: colors.primary },
  badge: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxxl * 1.5,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
});
