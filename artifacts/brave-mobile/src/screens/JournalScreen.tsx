/**
 * Weekly journal.
 *
 * The web page is a dropdown of weeks plus a textarea. On a phone a dropdown is
 * a modal you have to open to discover what is inside, so the open week is
 * simply presented — it is the one a student wants 95% of the time — and past
 * entries are a list underneath.
 *
 * The composer is deliberately NOT inside the pull-to-refresh scroll view: a
 * pull gesture on a half-written entry that discarded the draft would be
 * unforgivable, and it is exactly the kind of thing a wrapped web page gets
 * wrong.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpenCheck, CircleCheck, CalendarClock } from 'lucide-react-native';
import { AppBar, ScreenContainer } from '../components/Screen';
import {
  Card,
  Caption,
  Micro,
  BodyStrong,
  Body,
  Button,
  Skeleton,
  EmptyState,
  Badge,
} from '../components/ui';
import { colors, space, radius, font } from '../theme/tokens';
import {
  useCurrentWeek,
  useMyJournals,
  useSubmitJournal,
  useProgressSummary,
  asArray,
  JournalEntry,
} from '../lib/queries';
import { dateRange, shortDate } from '../lib/format';

const MIN_CHARS = 40;

export function JournalScreen() {
  const insets = useSafeAreaInsets();
  const week = useCurrentWeek();
  const journals = useMyJournals();
  const progress = useProgressSummary();
  const submit = useSubmitJournal();

  const [draft, setDraft] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const entries = useMemo(
    () => asArray<JournalEntry>(journals.data),
    [journals.data],
  );

  const openWeek = week.data ?? null;
  const alreadyIn =
    !!progress.data?.submittedThisWeek ||
    (openWeek?.id != null && entries.some(e => e.weekId === openWeek.id));

  const tooShort = draft.trim().length < MIN_CHARS;

  const onSubmit = () => {
    if (!openWeek?.id || tooShort) return;
    submit.mutate(
      { weekId: openWeek.id, content: draft.trim() },
      {
        onSuccess: () => {
          setDraft('');
          setJustSaved(true);
        },
      },
    );
  };

  return (
    <ScreenContainer>
      <AppBar title="Weekly Journal" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Android resizes the window itself; iOS needs the padding nudge or the
        // keyboard covers the composer.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{
            padding: space.lg,
            paddingBottom: space.xxxl * 2 + insets.bottom,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {week.isLoading ? (
            <Card>
              <Skeleton height={14} width="35%" />
              <Skeleton height={22} width="70%" style={{ marginTop: space.md }} />
              <Skeleton height={120} style={{ marginTop: space.lg }} />
            </Card>
          ) : !openWeek ? (
            <Card>
              <View style={s.row}>
                <CalendarClock size={18} color={colors.warning} />
                <BodyStrong style={{ marginLeft: space.sm }}>
                  No weeks are currently open
                </BodyStrong>
              </View>
              <Caption style={{ marginTop: space.sm }}>
                Your journal opens when the programme week begins. Nothing is
                overdue.
              </Caption>
            </Card>
          ) : alreadyIn || justSaved ? (
            <Card style={s.done}>
              <View style={s.row}>
                <CircleCheck size={20} color={colors.success} />
                <BodyStrong style={{ marginLeft: space.sm }}>
                  Week {openWeek.weekNumber} submitted
                </BodyStrong>
              </View>
              <Caption style={{ marginTop: space.sm }}>
                {dateRange(openWeek.startDate, openWeek.endDate)} — thanks, that
                is this week done.
              </Caption>
            </Card>
          ) : (
            <Card>
              <View style={s.rowBetween}>
                <Micro>Week {openWeek.weekNumber}</Micro>
                <Badge label="Open" tone="success" />
              </View>
              <Caption style={{ marginTop: 4 }}>
                {dateRange(openWeek.startDate, openWeek.endDate)}
              </Caption>

              <Text style={s.prompt}>
                What moved this week? What is blocking you?
              </Text>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                multiline
                textAlignVertical="top"
                placeholder="Wins, setbacks, what you tried, what you need help with…"
                placeholderTextColor={colors.mutedForeground}
                style={s.input}
              />

              <View style={s.rowBetween}>
                <Caption>
                  {tooShort
                    ? `${MIN_CHARS - draft.trim().length} more characters`
                    : `${draft.trim().length} characters`}
                </Caption>
              </View>

              {submit.isError ? (
                <Text style={s.error}>
                  {(submit.error as Error)?.message ?? 'Could not submit.'}
                </Text>
              ) : null}

              <Button
                label="Submit journal"
                onPress={onSubmit}
                disabled={tooShort}
                loading={submit.isPending}
                style={{ marginTop: space.md }}
              />
            </Card>
          )}

          {/* ── Past entries ──────────────────────────────────────── */}
          <Micro style={{ marginTop: space.xxl, marginBottom: space.md }}>
            Past journals
          </Micro>

          {journals.isLoading ? (
            <>
              <Card style={{ marginBottom: space.md }}>
                <Skeleton height={14} width="30%" />
                <Skeleton height={40} style={{ marginTop: space.sm }} />
              </Card>
              <Card>
                <Skeleton height={14} width="30%" />
                <Skeleton height={40} style={{ marginTop: space.sm }} />
              </Card>
            </>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<BookOpenCheck size={26} color={colors.mutedForeground} />}
              title="No past journals yet"
              message="Entries you submit will collect here week by week."
            />
          ) : (
            entries.map((e, i) => (
              <Card key={e.id ?? i} style={{ marginBottom: space.md }}>
                <View style={s.rowBetween}>
                  <BodyStrong>
                    Week {e.weekNumber ?? '—'}
                  </BodyStrong>
                  <Caption>{shortDate(e.submittedAt)}</Caption>
                </View>
                {e.content ? (
                  <Body numberOfLines={3} style={{ marginTop: space.sm }}>
                    {e.content}
                  </Body>
                ) : null}
              </Card>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prompt: { ...font.bodyStrong, color: colors.foreground, marginTop: space.lg },
  input: {
    marginTop: space.md,
    minHeight: 150,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: space.md,
    ...font.body,
    color: colors.foreground,
  },
  error: { ...font.caption, color: colors.danger, marginTop: space.sm },
  done: { backgroundColor: colors.successBg, borderColor: '#CBE7D5' },
});
