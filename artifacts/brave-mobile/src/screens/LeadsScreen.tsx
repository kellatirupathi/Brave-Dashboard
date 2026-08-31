/**
 * Leads.
 *
 * The web page opens with a five-step explainer that fills the whole phone
 * screen, so a student with leads must scroll past the tutorial every single
 * time to reach their work. Here the pipeline explainer is collapsed to a
 * single progress strip once there is at least one lead — a first-run aid, not
 * a permanent fixture.
 *
 * The list is a FlatList rather than a mapped ScrollView: it recycles rows, so
 * a student with sixty leads scrolls at the same frame rate as one with three.
 */
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Handshake,
  Plus,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { AppBar, ScreenContainer } from '../components/Screen';
import {
  Card,
  Caption,
  Micro,
  BodyStrong,
  Badge,
  Button,
  Skeleton,
  EmptyState,
} from '../components/ui';
import { colors, space, font } from '../theme/tokens';
import { useLeads, asArray, Lead } from '../lib/queries';
import { shortDate } from '../lib/format';

const STEPS = [
  { title: 'Capture the lead', detail: 'Start by logging a client' },
  { title: 'Work the lead', detail: '3 dated interactions over 7+ days' },
  { title: 'Open the project', detail: 'Needs a converted lead' },
  { title: 'Deliver & log payment', detail: 'Proof and invoice required' },
  { title: 'BRD ready', detail: 'Generated automatically' },
];

function statusTone(status?: string | null) {
  const v = (status ?? '').toLowerCase();
  if (v.includes('convert')) return 'success' as const;
  if (v.includes('lost') || v.includes('dead')) return 'danger' as const;
  if (v.includes('progress') || v.includes('active')) return 'warning' as const;
  return 'neutral' as const;
}

export function LeadsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const leads = useLeads();
  const [guideOpen, setGuideOpen] = useState(false);

  const rows = useMemo(() => asArray<Lead>(leads.data), [leads.data]);
  const hasLeads = rows.length > 0;

  return (
    <ScreenContainer>
      <AppBar title="Leads" />

      <FlatList
        data={leads.isLoading ? [] : rows}
        keyExtractor={(item, i) => String(item.id ?? i)}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          padding: space.lg,
          paddingBottom: space.xxxl * 2 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={leads.isRefetching}
            onRefresh={() => void leads.refetch()}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
        ListHeaderComponent={
          <View>
            <Caption style={{ marginBottom: space.lg }}>
              Every project starts as a client you actually met.
            </Caption>

            <Button
              label="Log a client"
              icon={<Plus size={18} color={colors.white} />}
              onPress={() => nav.navigate('LeadCreate')}
            />

            {/* The explainer: expanded for a first-timer, collapsed after. */}
            <Pressable
              onPress={() => setGuideOpen(o => !o)}
              android_ripple={{ color: 'rgba(201,29,29,0.08)' }}
              style={s.guideHead}
            >
              <Micro style={{ flex: 1 }}>How the pipeline works</Micro>
              {guideOpen || !hasLeads ? (
                <ChevronUp size={18} color={colors.mutedForeground} />
              ) : (
                <ChevronDown size={18} color={colors.mutedForeground} />
              )}
            </Pressable>

            {guideOpen || !hasLeads ? (
              <Card style={{ marginBottom: space.lg }}>
                {STEPS.map((step, i) => (
                  <View key={step.title} style={s.step}>
                    <View style={[s.stepDot, i === 0 && s.stepDotActive]}>
                      <Text style={[s.stepNum, i === 0 && s.stepNumActive]}>
                        {i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <BodyStrong>{step.title}</BodyStrong>
                      <Caption style={{ marginTop: 1 }}>{step.detail}</Caption>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {hasLeads ? (
              <Micro style={{ marginBottom: space.md }}>
                {rows.length} {rows.length === 1 ? 'lead' : 'leads'}
              </Micro>
            ) : null}

            {leads.isLoading ? (
              <>
                <Card style={{ marginBottom: space.md }}>
                  <Skeleton height={16} width="55%" />
                  <Skeleton height={12} width="35%" style={{ marginTop: space.sm }} />
                </Card>
                <Card>
                  <Skeleton height={16} width="45%" />
                  <Skeleton height={12} width="30%" style={{ marginTop: space.sm }} />
                </Card>
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          leads.isLoading ? undefined : (
            <EmptyState
              icon={<Handshake size={26} color={colors.mutedForeground} />}
              title="No leads yet"
              message="Log the first client you spoke to. A project can only start from a converted lead."
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            onPress={() => nav.navigate('LeadDetail', { id: item.id })}
            style={{ marginBottom: space.md }}
          >
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <BodyStrong numberOfLines={1}>
                  {item.businessName ?? item.clientName ?? 'Untitled lead'}
                </BodyStrong>
                <Caption numberOfLines={1} style={{ marginTop: 2 }}>
                  {item.contactPerson ? `${item.contactPerson} · ` : ''}
                  {item.interactionCount ?? 0} interactions
                </Caption>
              </View>
              <ChevronRight size={20} color={colors.mutedForeground} />
            </View>
            <View style={[s.row, { marginTop: space.md, gap: space.sm }]}>
              {item.status ? (
                <Badge label={item.status} tone={statusTone(item.status)} />
              ) : null}
              {item.trailStrength ? (
                <Badge label={item.trailStrength} tone="neutral" />
              ) : null}
              <View style={{ flex: 1 }} />
              <Caption>{shortDate(item.createdAt)}</Caption>
            </View>
          </Card>
        )}
      />
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  guideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
  },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  stepDotActive: { backgroundColor: colors.accentRed },
  stepNum: { ...font.micro, color: colors.mutedForeground },
  stepNumActive: { color: colors.white },
});
