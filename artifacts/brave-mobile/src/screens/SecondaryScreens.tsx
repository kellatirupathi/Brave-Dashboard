/**
 * The screens reached from More and from taps on the Dashboard.
 *
 * They share a file because they share a shape: an app bar with a back arrow,
 * a scrolling body, one query. Splitting four ~80-line screens into four files
 * would spread one pattern across four places without making any of them
 * clearer.
 */
import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Trophy,
  Bell,
  Users,
  ShieldCheck,
  Award,
  Inbox,
  ExternalLink,
} from 'lucide-react-native';
import { AppBar, ScreenContainer } from '../components/Screen';
import {
  Card,
  Caption,
  Micro,
  Body,
  BodyStrong,
  Title,
  Badge,
  Button,
  Skeleton,
  EmptyState,
  Divider,
} from '../components/ui';
import { colors, space, radius, font } from '../theme/tokens';
import { useAuth } from '../lib/auth';
import {
  useMyTeam,
  useLeaderboard,
  useNotifications,
  useMarkAllRead,
  useLead,
  asArray,
  LeaderboardRow,
  AppNotification,
} from '../lib/queries';
import { inr, inrCompact, initials, fullName, relative, shortDate } from '../lib/format';
import { API_BASE } from '../lib/config';

/** Shared frame: back arrow, title, scrolling body. */
function Sub({
  title,
  children,
  refreshing,
  onRefresh,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <ScreenContainer>
      <AppBar title={title} onBack={() => nav.goBack()} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxxl + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              progressBackgroundColor={colors.card}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </ScreenContainer>
  );
}

/* ── Profile ──────────────────────────────────────────────────────── */

export function ProfileScreen() {
  const { user } = useAuth();
  const team = useMyTeam();
  return (
    <Sub title="Profile">
      <View style={s.center}>
        <View style={s.bigAvatar}>
          <Text style={s.bigAvatarText}>
            {initials(user?.firstName, user?.lastName, 'U')}
          </Text>
        </View>
        <Title style={{ marginTop: space.lg, textAlign: 'center' }}>
          {fullName(user?.firstName, user?.lastName) || 'Student'}
        </Title>
        <Caption style={{ marginTop: 2 }}>{user?.email ?? ''}</Caption>
      </View>

      <Card style={{ marginTop: space.xl }}>
        <Micro>Account</Micro>
        <Field label="Name" value={fullName(user?.firstName, user?.lastName) || '—'} />
        <Field label="Email" value={user?.email ?? '—'} />
        <Field label="Role" value={user?.role ?? '—'} />
        <Field label="Team" value={team.data?.name ?? '—'} last />
      </Card>

      <Caption style={{ marginTop: space.lg, textAlign: 'center' }}>
        Details come from your NIAT account. To change them, update your NIAT
        profile.
      </Caption>
    </Sub>
  );
}

function Field({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <>
      <View style={s.field}>
        <Caption style={{ width: 88 }}>{label}</Caption>
        <Body style={{ flex: 1 }} numberOfLines={2}>
          {value}
        </Body>
      </View>
      {last ? null : <Divider />}
    </>
  );
}

/* ── Team ─────────────────────────────────────────────────────────── */

export function TeamScreen() {
  const team = useMyTeam();
  const t = team.data;
  return (
    <Sub
      title="My Team"
      refreshing={team.isRefetching}
      onRefresh={() => void team.refetch()}
    >
      {team.isLoading ? (
        <Card>
          <Skeleton height={22} width="60%" />
          <Skeleton height={14} width="40%" style={{ marginTop: space.sm }} />
        </Card>
      ) : !t ? (
        <EmptyState
          icon={<Users size={26} color={colors.mutedForeground} />}
          title="No team yet"
          message="Once you join or form a team it will appear here."
        />
      ) : (
        <>
          <Card>
            <View style={s.center}>
              <View style={s.teamMark}>
                <Text style={s.teamMarkText}>
                  {(t.name ?? '??').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Title style={{ marginTop: space.md, textAlign: 'center' }}>
                {t.name ?? 'Team'}
              </Title>
              {t.tagline ? (
                <Caption style={{ marginTop: 2, textAlign: 'center' }}>
                  {t.tagline}
                </Caption>
              ) : null}
              <View style={[s.row, { marginTop: space.md, gap: space.sm }]}>
                {t.status ? <Badge label={t.status} tone="success" /> : null}
                {t.campusName ? <Badge label={t.campusName} tone="gold" /> : null}
              </View>
            </View>
          </Card>

          <View style={[s.row, { gap: space.md, marginTop: space.md }]}>
            <Card style={{ flex: 1 }}>
              <Micro>Verified</Micro>
              <Text style={s.metric}>{inrCompact(t.verifiedRevenue)}</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Micro>Order book</Micro>
              <Text style={s.metric}>{inrCompact(t.orderBookValue)}</Text>
            </Card>
          </View>

          {t.trustTier ? (
            <Card style={{ marginTop: space.md }}>
              <View style={s.row}>
                <ShieldCheck size={18} color={colors.mutedForeground} />
                <BodyStrong style={{ marginLeft: space.sm, flex: 1 }}>
                  Trust standing
                </BodyStrong>
                <Badge label={t.trustTier} tone="gold" />
              </View>
              <Caption style={{ marginTop: space.sm }}>
                Trust builds as revenue is verified and clients confirm their
                payments.
              </Caption>
            </Card>
          ) : null}

          <Micro style={{ marginTop: space.xl, marginBottom: space.md }}>
            Members ({t.members?.length ?? 0})
          </Micro>
          {(t.members ?? []).map((m, i) => (
            <Card key={m.id ?? i} style={{ marginBottom: space.sm }}>
              <View style={s.row}>
                <View style={s.smallAvatar}>
                  <Text style={s.smallAvatarText}>
                    {initials(m.firstName, m.lastName)}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <BodyStrong numberOfLines={1}>
                    {fullName(m.firstName, m.lastName) || 'Member'}
                  </BodyStrong>
                  {m.role ? <Caption>{m.role}</Caption> : null}
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </Sub>
  );
}

/* ── Leaderboard ──────────────────────────────────────────────────── */

const SCOPES = [
  { key: 'national' as const, label: 'National' },
  { key: 'campus' as const, label: 'My Campus' },
  { key: 'overall' as const, label: 'Overall' },
];

export function LeaderboardScreen() {
  const [scope, setScope] = useState<'national' | 'campus' | 'overall'>('national');
  const board = useLeaderboard(scope);
  const rows = useMemo(() => asArray<LeaderboardRow>(board.data), [board.data]);

  return (
    <Sub
      title="Leaderboard"
      refreshing={board.isRefetching}
      onRefresh={() => void board.refetch()}
    >
      <Caption style={{ marginBottom: space.md }}>
        Race to ₹2,00,000 verified revenue
      </Caption>

      {/* A segmented control, not three buttons — this is one choice of three. */}
      <View style={s.segment}>
        {SCOPES.map(sc => {
          const on = scope === sc.key;
          return (
            <Pressable
              key={sc.key}
              onPress={() => setScope(sc.key)}
              android_ripple={{ color: 'rgba(201,29,29,0.10)' }}
              style={[s.segmentItem, on && s.segmentItemOn]}
            >
              <Text style={[s.segmentText, on && s.segmentTextOn]}>{sc.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {board.isLoading ? (
        [0, 1, 2].map(i => (
          <Card key={i} style={{ marginBottom: space.md }}>
            <Skeleton height={18} width="55%" />
            <Skeleton height={13} width="35%" style={{ marginTop: space.sm }} />
          </Card>
        ))
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Trophy size={26} color={colors.mutedForeground} />}
          title="Nothing ranked yet"
          message="Teams appear here once revenue is verified."
        />
      ) : (
        rows.map((r, i) => {
          const rank = r.rank ?? i + 1;
          return (
            <Card key={r.teamId ?? i} style={{ marginBottom: space.md }}>
              <View style={s.row}>
                <View style={[s.rank, rank <= 3 && s.rankTop]}>
                  <Text style={[s.rankText, rank <= 3 && s.rankTextTop]}>
                    {rank}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: space.md }}>
                  <View style={[s.row, { gap: space.sm }]}>
                    <BodyStrong numberOfLines={1} style={{ flexShrink: 1 }}>
                      {r.teamName ?? 'Team'}
                    </BodyStrong>
                    {r.qualified ? <Badge label="Qualified" tone="success" /> : null}
                  </View>
                  <Caption numberOfLines={1} style={{ marginTop: 1 }}>
                    {r.campusName ?? '—'} · {r.projectCount ?? 0} projects
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.money}>
                    {inrCompact(r.verifiedRevenue ?? r.overallRevenue)}
                  </Text>
                  {r.orderBookValue ? (
                    <Caption style={{ fontSize: 11 }}>
                      +{inrCompact(r.orderBookValue)} book
                    </Caption>
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Sub>
  );
}

/* ── Notifications ────────────────────────────────────────────────── */

export function NotificationsScreen() {
  const list = useNotifications();
  const markAll = useMarkAllRead();
  const rows = useMemo(() => asArray<AppNotification>(list.data), [list.data]);
  const unread = rows.filter(n => !(n.read ?? n.isRead)).length;

  return (
    <Sub
      title="Notifications"
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
    >
      {unread > 0 ? (
        <Button
          label={`Mark all ${unread} as read`}
          variant="secondary"
          loading={markAll.isPending}
          onPress={() => markAll.mutate()}
          style={{ marginBottom: space.lg }}
        />
      ) : null}

      {list.isLoading ? (
        [0, 1, 2].map(i => (
          <Card key={i} style={{ marginBottom: space.md }}>
            <Skeleton height={15} width="60%" />
            <Skeleton height={12} width="90%" style={{ marginTop: space.sm }} />
          </Card>
        ))
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox size={26} color={colors.mutedForeground} />}
          title="Nothing new"
          message="Updates about your journal, team and submissions land here."
        />
      ) : (
        rows.map((n, i) => {
          const isUnread = !(n.read ?? n.isRead);
          return (
            <Card
              key={n.id ?? i}
              style={[{ marginBottom: space.md }, isUnread && s.unread]}
            >
              <View style={s.row}>
                {isUnread ? <View style={s.dot} /> : null}
                <BodyStrong style={{ flex: 1 }} numberOfLines={2}>
                  {n.title ?? 'Update'}
                </BodyStrong>
              </View>
              {n.body ?? n.message ? (
                <Body style={{ marginTop: space.xs }} numberOfLines={4}>
                  {n.body ?? n.message}
                </Body>
              ) : null}
              <Caption style={{ marginTop: space.sm }}>
                {relative(n.createdAt)}
              </Caption>
            </Card>
          );
        })
      )}
    </Sub>
  );
}

/* ── Lead detail ──────────────────────────────────────────────────── */

export function LeadDetailScreen() {
  const route = useRoute<any>();
  const id = route.params?.id as number | undefined;
  const lead = useLead(id);
  const l = lead.data;

  return (
    <Sub
      title={l?.businessName ?? l?.clientName ?? 'Lead'}
      refreshing={lead.isRefetching}
      onRefresh={() => void lead.refetch()}
    >
      {lead.isLoading ? (
        <Card>
          <Skeleton height={22} width="60%" />
          <Skeleton height={14} width="40%" style={{ marginTop: space.sm }} />
        </Card>
      ) : !l ? (
        <EmptyState title="Lead not found" message="It may have been removed." />
      ) : (
        <>
          <Card>
            <Title numberOfLines={2}>
              {l.businessName ?? l.clientName ?? 'Lead'}
            </Title>
            <View style={[s.row, { marginTop: space.md, gap: space.sm }]}>
              {l.status ? <Badge label={l.status} tone="neutral" /> : null}
              {l.trailStrength ? <Badge label={l.trailStrength} tone="gold" /> : null}
            </View>
          </Card>

          <Card style={{ marginTop: space.md }}>
            <Micro>Details</Micro>
            <Field label="Contact" value={l.contactPerson ?? '—'} />
            <Field label="Client" value={l.clientName ?? '—'} />
            <Field
              label="Interactions"
              value={String(l.interactionCount ?? 0)}
            />
            <Field label="Created" value={shortDate(l.createdAt)} last />
          </Card>

          <Caption style={{ marginTop: space.lg, textAlign: 'center' }}>
            Interaction logging and project conversion are being brought over
            next. Use the website for those in the meantime.
          </Caption>
        </>
      )}
    </Sub>
  );
}

/* ── Placeholders for routes not yet ported ───────────────────────── */

/**
 * An honest placeholder beats a broken screen. Each of these opens the real
 * page on the website rather than pretending the feature is missing.
 */
function WebFallback({ title, path, blurb }: { title: string; path: string; blurb: string }) {
  return (
    <Sub title={title}>
      <EmptyState
        icon={<ExternalLink size={26} color={colors.mutedForeground} />}
        title={`${title} is on the website`}
        message={blurb}
        action={
          <Button
            label="Open in browser"
            variant="secondary"
            onPress={() => void Linking.openURL(`${API_BASE}${path}`)}
          />
        }
      />
    </Sub>
  );
}

export const GritMilesScreen = () => (
  <WebFallback
    title="GRIT Miles"
    path="/grit-miles"
    blurb="Levels and rewards are coming to the app in the next build."
  />
);
export const DemoDayScreen = () => (
  <WebFallback
    title="Demo Day"
    path="/demo-day"
    blurb="Submissions need file upload, which lands in the next build."
  />
);
export const ResourcesScreen = () => (
  <WebFallback
    title="Resources"
    path="/resources-library"
    blurb="The library opens in your browser for now."
  />
);
export const GuidebookScreen = () => (
  <WebFallback
    title="Guidebook"
    path="/guidebook"
    blurb="The guidebook is a long-form document, best read in a browser."
  />
);
export const LeadCreateScreen = () => (
  <WebFallback
    title="Log a client"
    path="/leads"
    blurb="The capture form is being ported. Log the client on the website and it will appear here."
  />
);

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center' },
  bigAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatarText: { fontSize: 30, fontWeight: '800', color: colors.accentForeground },
  smallAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: { ...font.caption, fontWeight: '700', color: colors.foreground },
  teamMark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMarkText: { fontSize: 24, fontWeight: '800', color: colors.primary },
  field: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  metric: { ...font.title, fontSize: 22, marginTop: space.xs, color: colors.foreground },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: space.lg,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  segmentItemOn: { backgroundColor: colors.card },
  segmentText: { ...font.caption, fontWeight: '600', color: colors.mutedForeground },
  segmentTextOn: { color: colors.foreground, fontWeight: '700' },
  rank: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTop: { backgroundColor: colors.accent },
  rankText: { ...font.caption, fontWeight: '800', color: colors.mutedForeground },
  rankTextTop: { color: colors.accentForeground },
  money: { ...font.bodyStrong, color: colors.primary },
  unread: { borderColor: colors.accent, backgroundColor: '#FFFDF7' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentRed,
    marginRight: space.sm,
  },
});
