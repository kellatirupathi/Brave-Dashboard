/**
 * More.
 *
 * The fourth tab. A student has up to ten destinations depending on which
 * features an admin has switched on, and hiding the surplus behind a hamburger
 * at the OPPOSITE end of the screen — top-left, where the thumb cannot reach —
 * is the single thing that most makes a web app feel like a web app on a phone.
 *
 * A full screen rather than a slide-up sheet: a sheet that fills most of the
 * display to show a grid of links is a sheet pretending to be a screen.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Trophy,
  Award,
  Users,
  Library,
  BookOpen,
  Rocket,
  LogOut,
} from 'lucide-react-native';
import { AppBar, ScreenContainer } from '../components/Screen';
import { Card, Caption, Micro, BodyStrong } from '../components/ui';
import { colors, space, radius, font } from '../theme/tokens';
import { useAuth } from '../lib/auth';
import { useMyTeam } from '../lib/queries';
import { initials, fullName } from '../lib/format';

type Dest = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  route?: string;
  url?: string;
};

const DESTINATIONS: Dest[] = [
  { key: 'profile', label: 'Profile', icon: User, route: 'Profile' },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy, route: 'Leaderboard' },
  { key: 'grit', label: 'GRIT Miles', icon: Award, route: 'GritMiles' },
  { key: 'team', label: 'My Team', icon: Users, route: 'Team' },
  { key: 'demoday', label: 'Demo Day', icon: Rocket, route: 'DemoDay' },
  { key: 'resources', label: 'Resources', icon: Library, route: 'Resources' },
  { key: 'guidebook', label: 'Guidebook', icon: BookOpen, route: 'Guidebook' },
];

export function MoreScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const team = useMyTeam();

  return (
    <ScreenContainer>
      <AppBar title="More" />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxxl * 2 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity, so a student can confirm which account they are in. */}
        <Card onPress={() => nav.navigate('Profile')} style={{ marginBottom: space.xl }}>
          <View style={s.row}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {initials(user?.firstName, user?.lastName, 'U')}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: space.md }}>
              <BodyStrong numberOfLines={1}>
                {fullName(user?.firstName, user?.lastName) || 'Your profile'}
              </BodyStrong>
              <Caption numberOfLines={1} style={{ marginTop: 1 }}>
                {user?.email ?? ''}
              </Caption>
              {team.data?.name ? (
                <Caption numberOfLines={1} style={{ marginTop: 1 }}>
                  {team.data.name}
                </Caption>
              ) : null}
            </View>
          </View>
        </Card>

        <Micro style={{ marginBottom: space.md }}>Everything else</Micro>

        <View style={s.grid}>
          {DESTINATIONS.map(d => {
            const Icon = d.icon;
            return (
              <Pressable
                key={d.key}
                onPress={() => d.route && nav.navigate(d.route)}
                android_ripple={{ color: 'rgba(201,29,29,0.10)' }}
                style={s.tile}
              >
                <View style={s.tileIcon}>
                  <Icon size={20} color={colors.foreground} />
                </View>
                <Text style={s.tileLabel} numberOfLines={1}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={signOut}
          android_ripple={{ color: 'rgba(201,29,29,0.12)' }}
          style={s.signOut}
        >
          <LogOut size={18} color={colors.danger} />
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>

        <Caption style={{ textAlign: 'center', marginTop: space.xl }}>
          BRAVE · NIAT
        </Caption>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...font.heading, color: colors.accentForeground },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    width: '31%',
    flexGrow: 1,
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: space.sm,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  tileLabel: { ...font.caption, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xxl,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  signOutText: { ...font.bodyStrong, color: colors.danger, marginLeft: space.sm },
});
