/**
 * Screen chrome: the top app bar and the scrolling body every screen sits in.
 *
 * The web app puts a hamburger top-left and centres a wordmark. That is a
 * website header. Material's app bar instead names the screen you are on and
 * offers a back affordance when there is somewhere to go back to — a menu at
 * the top duplicating the tab bar at the bottom is the clearest tell that a web
 * page has been wrapped in an app.
 */
import React from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, space, font, elevation } from '../theme/tokens';
import { Text } from 'react-native';

export function AppBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <>
      {/*
        React Native 0.87 draws Android edge-to-edge and no longer accepts a
        status-bar background colour. The bar below already paints `insets.top`
        in chrome, so the status area is coloured by the app bar itself — only
        the icon tint still needs setting.
      */}
      <StatusBar barStyle="light-content" />
      <View style={[s.bar, { paddingTop: insets.top }]}>
        <View style={s.barRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              android_ripple={{
                color: 'rgba(255,255,255,0.20)',
                borderless: true,
                radius: 24,
              }}
              style={s.backBtn}
            >
              <ChevronLeft size={26} color={colors.chromeForeground} />
            </Pressable>
          ) : (
            <View style={{ width: space.lg }} />
          )}
          <Text style={s.barTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={s.barRight}>{right}</View>
        </View>
      </View>
    </>
  );
}

/**
 * A scrolling screen body.
 *
 * `onRefresh` is opt-in rather than automatic: pull-to-refresh on a screen
 * holding a half-typed form throws the draft away, so only read-only screens
 * pass it.
 */
export function ScreenBody({
  children,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={s.body}
      contentContainerStyle={[
        {
          padding: space.lg,
          // Clear the tab bar plus the gesture pill, so the last card is never
          // trapped behind the navigation.
          paddingBottom: space.xxxl * 2 + insets.bottom,
        },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      // Android's stretch overscroll is part of what makes a list feel native.
      overScrollMode="always"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.card}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Full-bleed container for a screen that manages its own scrolling. */
export function ScreenContainer({ children }: { children: React.ReactNode }) {
  return <View style={s.container}>{children}</View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, backgroundColor: colors.background },
  bar: {
    backgroundColor: colors.chrome,
    ...elevation(2),
    // Android draws the app bar shadow from elevation; iOS needs the border.
    ...Platform.select({
      ios: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.chromeBorder },
      default: {},
    }),
  },
  barRow: {
    height: 56, // Material spec for a top app bar.
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  barTitle: {
    ...font.heading,
    fontSize: 19,
    color: colors.chromeForeground,
    flex: 1,
    marginLeft: space.sm,
  },
  barRight: { flexDirection: 'row', alignItems: 'center', paddingRight: space.sm },
});
