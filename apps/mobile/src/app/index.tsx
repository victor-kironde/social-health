import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../data/store';
import { Button, Card, Label } from '../ui/components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS, RHYTHM_LABELS, lastContactText } from '../ui/labels';
import { useTheme } from '../ui/theme';

export default function Home() {
  const t = useTheme();
  const { log, status, error } = useStore();

  const result = useMemo(() => computeScore(log, DEFAULT_CONFIG, Date.now()), [log]);
  const names = useMemo(() => new Map(log.people.map((p) => [p.id, p.displayName])), [log.people]);
  const people = useMemo(
    () =>
      result.relationships
        .filter((r) => r.state !== 'archived')
        .sort((a, b) => b.importance - a.importance || (names.get(a.personId) ?? '').localeCompare(names.get(b.personId) ?? '')),
    [result, names],
  );

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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {people.length === 0 ? (
        <Card>
          <Text style={[styles.heading, { color: t.text }]}>Start with the people who matter to you</Text>
          <Text style={{ color: t.muted, lineHeight: 20 }}>
            Add someone you want to stay in touch with. Everything you record stays on this device and is encrypted.
          </Text>
        </Card>
      ) : (
        <Card>
          <Label>Social Health Score</Label>
          <Text style={[styles.score, { color: t.text }]}>{Math.round(result.total)}</Text>
          {result.lowData && (
            <Text style={{ color: t.warn }}>Not much has been logged recently, so this score is uncertain.</Text>
          )}
        </Card>
      )}

      <Button title="Add person" onPress={() => router.push('/person/new')} />

      {people.length > 0 && (
        <Card style={{ gap: 0 }}>
          <Label>
            {people.length} {people.length === 1 ? 'person' : 'people'}
          </Label>
          {people.map((r, i) => (
            <View
              key={r.personId}
              style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
            >
              <Text style={[styles.name, { color: t.text }]}>{names.get(r.personId) ?? 'Unknown'}</Text>
              <Text style={{ color: t.muted }}>
                {CATEGORY_LABELS[r.category]} · {IMPORTANCE_LABELS[r.importance]} · {RHYTHM_LABELS[r.rhythm]}
              </Text>
              <Text style={{ color: t.muted }}>{lastContactText(r.lastContactAgeDays)}</Text>
            </View>
          ))}
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
  person: { paddingVertical: 10, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', paddingVertical: 12 },
});
