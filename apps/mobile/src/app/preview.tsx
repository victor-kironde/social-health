import { DAY, DEFAULT_CONFIG, computeScore, explain, type ComponentName, type EventLog } from '@sg/score-engine';
import * as scenarios from '@sg/synth/scenarios';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { dbStatus, type DbStatus } from '../data/db';
import { Card, ChoiceChips, Label } from '../ui/components';
import { useTheme } from '../ui/theme';

const SCENARIOS: Record<string, () => EventLog> = {
  'Close-knit': () => scenarios.closeKnit(),
  'Messages only': () => scenarios.closeKnit('message'),
  Balanced: scenarios.balanced,
  Concentrated: scenarios.concentrated,
  'Large, neglected': scenarios.largeNeglected,
  Inactive: scenarios.inactive,
  'Busy, paused': () => scenarios.busyPeriod(true),
  'Busy, unpaused': () => scenarios.busyPeriod(false),
};

const COMPONENTS: [ComponentName, string][] = [
  ['rhythm', 'Contact rhythm'],
  ['coverage', 'Important relationships covered'],
  ['diversity', 'Balance across categories'],
  ['quality', 'Quality and support'],
];

/** Developer screen: the engine on synthetic scenarios, plus storage diagnostics. */
export default function Preview() {
  const t = useTheme();
  const [selected, setSelected] = useState('Close-knit');
  const [db, setDb] = useState<DbStatus | { error: string } | null>(null);

  useEffect(() => {
    dbStatus()
      .then(setDb)
      .catch((e: unknown) => setDb({ error: String(e) }));
  }, []);

  const { result, later, explanations } = useMemo(() => {
    const log = SCENARIOS[selected]!();
    const result = computeScore(log, DEFAULT_CONFIG, scenarios.AS_OF);
    const later = computeScore(log, DEFAULT_CONFIG, scenarios.AS_OF + 30 * DAY);
    return { result, later, explanations: explain(result, later) };
  }, [selected]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Label>Encrypted storage</Label>
        <Text style={{ color: t.text }}>
          {db === null
            ? 'Opening database…'
            : 'error' in db
              ? `Error: ${db.error}`
              : db.cipherVersion
                ? `SQLCipher ${db.cipherVersion} active · schema v${db.schemaVersion} · ${db.eventCount} events`
                : 'Not encrypted: SQLCipher is not active'}
        </Text>
      </Card>

      <ChoiceChips
        options={Object.keys(SCENARIOS).map((name) => ({ value: name, label: name }))}
        value={selected}
        onChange={setSelected}
      />

      <Card>
        <Label>Model v{result.modelVersion}</Label>
        <Text style={[styles.score, { color: t.text }]}>{Math.round(result.total)}</Text>
        <Text style={{ color: result.lowData ? t.warn : t.muted }}>
          {result.lowData
            ? `Low data (confidence ${result.confidence.toFixed(2)}): treat this score as uncertain`
            : `Confidence ${result.confidence.toFixed(2)}`}
        </Text>
        {COMPONENTS.map(([key, label]) => {
          const v = result.components[key];
          return (
            <View key={key} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={{ color: t.text }}>{label}</Text>
                <Text style={{ color: t.muted }}>{v === null ? 'n/a' : Math.round(v * 100)}</Text>
              </View>
              <View style={[styles.track, { backgroundColor: t.track }]}>
                <View style={[styles.fill, { width: `${(v ?? 0) * 100}%`, backgroundColor: t.accent }]} />
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <Label>
          If 30 days pass with no contact ({Math.round(result.total)} → {Math.round(later.total)})
        </Label>
        {explanations.length === 0 ? (
          <Text style={{ color: t.text }}>No notable changes.</Text>
        ) : (
          explanations.map((e, i) => (
            <Text key={i} style={[styles.explanation, { color: t.text }]}>
              • {e.text}
            </Text>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  score: { fontSize: 56, fontWeight: '700' },
  row: { marginTop: 10 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  explanation: { marginTop: 4, lineHeight: 20 },
});
