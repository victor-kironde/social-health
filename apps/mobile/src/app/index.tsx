import { DAY, DEFAULT_CONFIG, computeScore, explain, type RelationshipContribution } from '@sg/score-engine';
import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hasOnboarded } from '../data/onboarding';
import { usePrefs } from '../data/prefs';
import { useStore } from '../data/store';
import { Button, Card, Label } from '../ui/components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS, RHYTHM_LABELS, STATE_LABELS, lastContactText } from '../ui/labels';
import { ScoreBreakdown } from '../ui/ScoreBreakdown';
import { useTheme } from '../ui/theme';

const RETIRED = new Set(['archived', 'in_memoriam']);

export default function Home() {
  const t = useTheme();
  const { log, status, error } = useStore();
  const { prefs } = usePrefs();

  // First run: with nobody added yet and the welcome not seen, show it once.
  useEffect(() => {
    if (status !== 'ready' || log.people.length > 0) return;
    hasOnboarded()
      .then((done) => {
        if (!done) router.push('/welcome');
      })
      .catch(() => undefined);
    // Only when loading finishes.
  }, [status]);
  const [showRetired, setShowRetired] = useState(false);

  const { result, explanations, isNewUser } = useMemo(() => {
    const now = Date.now();
    const result = computeScore(log, DEFAULT_CONFIG, now);
    const monthAgo = computeScore(log, DEFAULT_CONFIG, now - 30 * DAY);
    const firstLogged = Math.min(...log.interactions.map((x) => x.loggedAt));
    return {
      result,
      // The low-data warning is shown separately, above.
      explanations: explain(monthAgo, result).filter((e) => e.kind !== 'low_data'),
      isNewUser: now - firstLogged < DEFAULT_CONFIG.confidence.windowDays * DAY,
    };
  }, [log]);

  const names = useMemo(() => new Map(log.people.map((p) => [p.id, p.displayName])), [log.people]);
  const byImportance = (a: RelationshipContribution, b: RelationshipContribution) =>
    b.importance - a.importance || (names.get(a.personId) ?? '').localeCompare(names.get(b.personId) ?? '');
  const people = result.relationships.filter((r) => !RETIRED.has(r.state)).sort(byImportance);
  const retired = result.relationships.filter((r) => RETIRED.has(r.state)).sort(byImportance);

  // With the score hidden, keep explanations about people, not about points.
  const shownExplanations = prefs.showScore ? explanations : explanations.filter((e) => e.kind !== 'component_change');

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.danger }}>Could not open your data: {error}</Text>
      </View>
    );
  }

  const row = (r: RelationshipContribution, i: number) => (
    <Pressable
      key={r.personId}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/person/[id]', params: { id: r.personId } })}
      style={({ pressed }) => [
        styles.person,
        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.name, { color: t.text }]}>{names.get(r.personId) ?? 'Unknown'}</Text>
      <Text style={{ color: t.muted }}>
        {CATEGORY_LABELS[r.category]} · {IMPORTANCE_LABELS[r.importance]} · {RHYTHM_LABELS[r.rhythm]}
        {r.state !== 'active' ? ` · ${STATE_LABELS[r.state]}` : ''}
      </Text>
      {!RETIRED.has(r.state) && <Text style={{ color: t.muted }}>{lastContactText(r.lastContactAgeDays)}</Text>}
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {result.relationships.length === 0 ? (
        <Card>
          <Text style={[styles.heading, { color: t.text }]}>Start with the people who matter to you</Text>
          <Text style={{ color: t.muted, lineHeight: 20 }}>
            Add someone you want to stay in touch with. Everything you record stays on this device and is encrypted.
          </Text>
        </Card>
      ) : log.interactions.length === 0 ? (
        // No score yet: before any contact it would rest on ratings alone.
        !prefs.showScore ? null : (
        <Card>
          <Label>Social Health Score</Label>
          <Text style={{ color: t.text, lineHeight: 20 }}>Log your first contact to see your score.</Text>
        </Card>
        )
      ) : (
        <>
          {prefs.showScore && (
          <Card>
            <Label>Social Health Score</Label>
            <Text style={[styles.score, { color: t.text }]}>{Math.round(result.total)}</Text>
            {result.lowData && (
              <Text style={{ color: t.warn }}>
                {isNewUser
                  ? 'Your score becomes more reliable as you log more contacts.'
                  : 'Not much has been logged recently, so this score is uncertain.'}
              </Text>
            )}
            <ScoreBreakdown result={result} />
          </Card>
          )}

          <Card>
            <Label>Last 30 days</Label>
            {isNewUser ? (
              // A month ago there was nothing to compare with.
              <Text style={{ color: t.muted, lineHeight: 20 }}>
                Changes will show here once you have been logging for a few weeks.
              </Text>
            ) : shownExplanations.length === 0 ? (
              <Text style={{ color: t.text }}>No notable changes.</Text>
            ) : (
              shownExplanations.map((e, i) => (
                <Text key={i} style={[styles.explanation, { color: t.text }]}>
                  • {e.text}
                  {e.personIds?.length ? ` (${e.personIds.map((id) => names.get(id) ?? 'someone').join(', ')})` : ''}
                </Text>
              ))
            )}
          </Card>
        </>
      )}

      {people.length > 0 && <Button title="Log contact" onPress={() => router.push('/log')} />}
      {people.length > 0 && <Button title="View as graph" variant="secondary" onPress={() => router.push('/graph')} />}
      <Button
        title="Add person"
        variant={people.length > 0 ? 'secondary' : 'primary'}
        onPress={() => router.push('/person/new')}
      />

      {people.length > 0 && (
        <Card style={{ gap: 0 }}>
          <Label>
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </Label>
          {people.map(row)}
        </Card>
      )}

      {retired.length > 0 && (
        <Card style={{ gap: 0 }}>
          <Pressable accessibilityRole="button" onPress={() => setShowRetired((s) => !s)}>
            <Label>
              {showRetired ? '▾' : '▸'} Archived and in memoriam ({retired.length})
            </Label>
          </Pressable>
          {showRetired && retired.map(row)}
        </Card>
      )}

      <Link href="/preview" style={[styles.link, { color: t.accent }]}>
        Engine preview (synthetic scenarios)
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  score: { fontSize: 56, fontWeight: '700' },
  explanation: { marginTop: 4, lineHeight: 20 },
  person: { paddingVertical: 10, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', paddingVertical: 12 },
});
