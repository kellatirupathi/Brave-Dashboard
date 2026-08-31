/**
 * Dashboard.
 *
 * The web version squeezes a horizontal week-tracker, four stat cards, a
 * feedback link and a notification bell into one viewport, and on a phone the
 * tracker overflows the screen edge with no indication there is more (visible
 * in the "1 2 3 4 5 6 7 8 …" strip cut off mid-row).
 *
 * Here the same information is a vertical stack ordered by what a student
 * actually opens the app to find out:
 *   1. Is my journal due?   — the recurring obligation, so it leads
 *   2. How are we doing?    — revenue and rank
 *   3. Where do we stand?   — trust, team
 */
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Wallet,
  Briefcase,
  Trophy,
  Building2,
  ChevronRight,
  CircleAlert,
} from 'lucide-react-native';
import { Pressable, Text } from 'react-native';
import { AppBar, ScreenContainer } from '../components/Screen';
import {
  Card,
  Caption,
  Micro,
  Title,
  BodyStrong,
  Badge,
  Skeleton,
  Button,
} from '../components/ui';
import { colors, space, radius, font, elevation } from '../theme/tokens';
import { useAuth } from '../lib/auth';
import {
  useProgressSummary,
  useMyTeam,
  useNotifications,
  asArray,
  AppNotification,
} from '../lib/queries';
import { inrCompact, dateRange } from '../lib/format';

export function DashboardScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const progress = useProgressSummary();
  const team = useMyTeam();
  const notifications = useNotifications();

  const unread = asArray<AppNotification>(notifications.data).filter(
    n => !(n.read ?? n.isRead),
  ).length;

  const refreshing =
    progress.isRefetching || team.isRefetching || notifications.isRefetching;

  const onRefresh = useCallback(() => {
    void progress.refetch();
    void team.refetch();
    void notifications.refetch();
  }, [progress, team, notifications]);

  const loading = progress.isLoading || team.isLoading;
  const t = team.data;
  const p = progress.data;

  return (
    <ScreenContainer>
      <AppBar
        title="Dashboard"
        right={
          <Pressable
            onPress={() => nav.navigate('Notifications')}
            hitSlop={10}
            android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true, radius: 22 }}
            style={s.bell}
          >
            <Bell size={21} color={colors.chromeForeground} />
            {unread > 0 ? (
              <View style={s.badgeDot}>
                <Text style={s.badgeDotText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
        }
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxxl * 2 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        {/* ── Who you are ─────────────────────────────────────────── */}
        <View style={s.greeting}>
          <Caption>Welcome back</Caption>
          {loading ? (
            <Skeleton height={28} width="70%" style={{ marginTop: space.sm }} />
          ) : (
            <Title numberOfLines={1}>{t?.name ?? user?.firstName ?? 'Your team'}</Title>
          )}
          {t?.tagline ? (
            <Caption numberOfLines={1} style={{ marginTop: 2 }}>
              {t.tagline}
            </Caption>
          ) : null}
        </View>

        {/* ── 1. The obligation ───────────────────────────────────── */}
        <JournalCallout
          loading={loading}
          weekNumber={p?.weekNumber ?? null}
          weekStart={p?.weekStart}
          weekEnd={p?.weekEnd}
          submitted={!!p?.submittedThisWeek}
          onPress={() => nav.navigate('Journal')}
        />

        {/* ── 2. How we are doing ─────────────────────────────────── */}
        <Micro style={s.sectionLabel}>Performance</Micro>
        <View style={s.grid}>
          <Stat
            loading={loading}
            icon={<Wallet size={18} color={colors.success} />}
            iconBg={colors.successBg}
            value={inrCompact(t?.verifiedRevenue)}
            label="Verified revenue"
            hint="Counts toward Demo Day"
          />
          <Stat
            loading={loading}
            icon={<Briefcase size={18} color="#2563EB" />}
            iconBg="#E7EEFD"
            value={inrCompact(t?.orderBookValue)}
            label="Order book"
            hint="Committed pipeline"
          />
          <Stat
            loading={loading}
            icon={<Trophy size={18} color={colors.warning} />}
            iconBg={colors.warningBg}
            value={t?.nationalRank ? `#${t.nationalRank}` : '—'}
            label="National rank"
            hint="All campuses"
          />
          <Stat
            loading={loading}
            icon={<Building2 size={18} color="#7C3AED" />}
            iconBg="#F1EAFE"
            value={t?.campusRank ? `#${t.campusRank}` : '—'}
            label="Campus rank"
            hint={t?.campusName ?? '—'}
          />
        </View>

        {/* ── 3. Where we stand ───────────────────────────────────── */}
        <Micro style={s.sectionLabel}>Your team</Micro>
        <Card onPress={() => nav.navigate('Team')} style={{ marginBottom: space.md }}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <BodyStrong numberOfLines={1}>{t?.name ?? 'My team'}</BodyStrong>
              <Caption style={{ marginTop: 2 }}>
                {t?.members?.length ?? 0} members
                {t?.campusName ? ` · ${t.campusName}` : ''}
              </Caption>
            </View>
            {t?.trustTier ? <Badge label={t.trustTier} tone="gold" /> : null}
            <ChevronRight size={20} color={colors.mutedForeground} />
          </View>
        </Card>

        <Card onPress={() => nav.navigate('Leaderboard')}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <BodyStrong>Leaderboard</BodyStrong>
              <Caption style={{ marginTop: 2 }}>Race to ₹2,00,000 verified revenue</Caption>
            </View>
            <ChevronRight size={20} color={colors.mutedForeground} />
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

/* ── The journal callout ──────────────────────────────────────────── */

/**
 * The single most important thing on this screen, so it gets colour and size
 * rather than a row in a list. It has three distinct states, and each says what
 * to do next rather than merely reporting a fact.
 */
function JournalCallout({
  loading,
  weekNumber,
  weekStart,
  weekEnd,
  submitted,
  onPress,
}: {
  loading: boolean;
  weekNumber: number | null;
  weekStart?: string;
  weekEnd?: string;
  submitted: boolean;
  onPress: () => void;
}) {
  if (loading) {
    return (
      <Card style={{ marginBottom: space.lg }}>
        <Skeleton height={14} width="40%" />
        <Skeleton height={24} width="80%" style={{ marginTop: space.md }} />
        <Skeleton height={44} style={{ marginTop: space.lg }} />
      </Card>
    );
  }

  // No open week is a normal state between seasons, not an error — the web app
  // showed a warning triangle here, which reads as something being broken.
  if (weekNumber == null) {
    return (
      <Card style={{ marginBottom: space.lg }}>
        <View style={s.row}>
          <CircleAlert size={18} color={colors.warning} />
          <BodyStrong style={{ marginLeft: space.sm }}>No week open yet</BodyStrong>
        </View>
        <Caption style={{ marginTop: space.sm }}>
          Your journal opens when the programme week begins. Nothing to do right now.
        </Caption>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card style={[s.calloutDone, { marginBottom: space.lg }]}>
        <Micro style={{ color: colors.success }}>Week {weekNumber} · Submitted</Micro>
        <BodyStrong style={{ marginTop: space.sm }}>
          Your journal is in for this week.
        </BodyStrong>
        <Caption style={{ marginTop: 2 }}>{dateRange(weekStart, weekEnd)}</Caption>
        <Button
          label="View or edit"
          variant="secondary"
          onPress={onPress}
          style={{ marginTop: space.lg }}
        />
      </Card>
    );
  }

  return (
    <Card style={[s.calloutDue, { marginBottom: space.lg }]}>
      <Micro style={{ color: colors.gold }}>Week {weekNumber} · Due</Micro>
      <Text style={s.calloutTitle}>Your weekly journal is open</Text>
      <Text style={s.calloutSub}>{dateRange(weekStart, weekEnd)}</Text>
      <Button label="Write this week's journal" onPress={onPress} style={{ marginTop: space.lg }} />
    </Card>
  );
}

/* ── Stat card ────────────────────────────────────────────────────── */

function Stat({
  loading,
  icon,
  iconBg,
  value,
  label,
  hint,
}: {
  loading: boolean;
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <Card style={s.stat}>
      <View style={[s.statIcon, { backgroundColor: iconBg }]}>{icon}</View>
      {loading ? (
        <Skeleton height={26} width="60%" style={{ marginTop: space.md }} />
      ) : (
        <Text style={s.statValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Micro style={{ marginTop: 2 }}>{label}</Micro>
      {hint ? (
        <Caption numberOfLines={1} style={{ marginTop: 2, fontSize: 11 }}>
          {hint}
        </Caption>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  bell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accentRed,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.chrome,
  },
  badgeDotText: { color: colors.white, fontSize: 9, fontWeight: '800' },
  greeting: { marginBottom: space.lg },
  sectionLabel: { marginTop: space.sm, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: {
    // Two per row: (100% - one gap) / 2. Written as a percentage so it holds on
    // a 5" phone and a 7" tablet alike.
    width: '48%',
    flexGrow: 1,
    padding: space.md,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    ...font.title,
    fontSize: 24,
    marginTop: space.md,
    color: colors.foreground,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  calloutDue: {
    backgroundColor: colors.chrome,
    borderColor: colors.chromeBorder,
    ...elevation(2),
  },
  calloutTitle: {
    ...font.title,
    color: colors.chromeForeground,
    marginTop: space.sm,
  },
  calloutSub: {
    ...font.caption,
    color: 'rgba(253,249,237,0.7)',
    marginTop: 2,
  },
  calloutDone: { backgroundColor: colors.successBg, borderColor: '#CBE7D5' },
});
