/**
 * The bottom tab bar.
 *
 * FOUR slots, not five. Material allows five, but the fifth would have been
 * Profile, and profile is not a *task* — it is something you visit once at
 * signup and then almost never. Spending a permanent thumb-reach slot on it
 * crowded the three screens that actually carry the work, so it lives at the
 * top of the More sheet where settings-shaped things belong.
 *
 * The bar is drawn by hand rather than left to the library's default. The
 * default is an iOS-leaning bar with a text label under a line icon; this one
 * is Material 3 — a filled pill behind the active icon, which is what makes the
 * selected tab readable at a glance on a phone held at arm's length.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  createBottomTabNavigator,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard,
  BookOpenCheck,
  Handshake,
  MoreHorizontal,
} from 'lucide-react-native';
import { colors, space, font, radius } from '../theme/tokens';
import { DashboardScreen } from '../screens/DashboardScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { LeadsScreen } from '../screens/LeadsScreen';
import { MoreScreen } from '../screens/MoreScreen';

export type TabParamList = {
  Dashboard: undefined;
  Journal: undefined;
  Leads: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS = {
  Dashboard: LayoutDashboard,
  Journal: BookOpenCheck,
  Leads: Handshake,
  More: MoreHorizontal,
} as const;

function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const Icon = ICONS[route.name as keyof typeof ICONS];
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={label}
            // Borderless ripple centred on the icon is the Material tab
            // behaviour; a bounded rectangle here looks like a web button.
            android_ripple={{
              color: 'rgba(249,195,31,0.20)',
              borderless: true,
              radius: 34,
            }}
            style={s.slot}
          >
            <View style={[s.pill, focused && s.pillActive]}>
              <Icon
                size={22}
                color={focused ? colors.gold : 'rgba(253,249,237,0.66)'}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
            <Text style={[s.label, focused && s.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        headerShown: false, // each screen renders its own AppBar
        // Keeps tabs mounted so switching back is instant and scroll position
        // survives — a remount on every tap is a web-router habit.
        lazy: true,
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ title: 'Journal' }} />
      <Tab.Screen name="Leads" component={LeadsScreen} options={{ title: 'Leads' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.chrome,
    borderTopWidth: 1,
    borderTopColor: colors.chromeBorder,
  },
  slot: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.sm,
    paddingBottom: space.xs + 2,
  },
  pill: {
    height: 28,
    width: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.chromeActive },
  label: {
    ...font.micro,
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: 3,
    color: 'rgba(253,249,237,0.66)',
  },
  labelActive: { color: colors.gold, fontWeight: '700' },
});
