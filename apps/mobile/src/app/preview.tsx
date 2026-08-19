import { DAY, DEFAULT_CONFIG, computeScore, explain, type EventLog } from '@sg/score-engine';
import * as scenarios from '@sg/synth/scenarios';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { dbStatus, type DbStatus } from '../data/db';
import { Button, Card, ChoiceChips, Label } from '../ui/components';
import { DEFAULT_ITERATIONS } from '../data/exportCrypto';
import { kdfSelfTest } from '../data/nativeKdf';
import { ScoreBreakdown } from '../ui/ScoreBreakdown';
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

/** Developer screen: the engine on synthetic scenarios, plus storage diagnostics. */
export default function Preview() {
  const t = useTheme();
  const [selected, setSelected] = useState('Close-knit');
  const [db, setDb] = useState<DbStatus | { error: string } | null>(null);
  const [kdf, setKdf] = useState<{ correct: boolean; ms: number } | { error: string } | null>(null);

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

      <Card>
        <Label>Export encryption check</Label>
        <Text style={{ color: t.text }}>
          {kdf === null
            ? `Checks the phone's key derivation against a known answer and times ${DEFAULT_ITERATIONS.toLocaleString()} iterations.`
            : 'error' in kdf
              ? `Error: ${kdf.error}`
              : `${kdf.correct ? 'Correct' : 'WRONG RESULT'} · ${DEFAULT_ITERATIONS.toLocaleString()} iterations in ${(kdf.ms / 1000).toFixed(2)} s`}
        </Text>
        <View style={{ marginTop: 8 }}>
          <Button
            title="Run check"
            variant="secondary"
            onPress={() => {
              setKdf(null);
              kdfSelfTest(DEFAULT_ITERATIONS)
                .then(setKdf)
                .catch((e: unknown) => setKdf({ error: String(e) }));
            }}
          />
        </View>
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
        <ScoreBreakdown result={result} />
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

      <Link href={{ pathname: '/graph', params: { demo: '150' } }} style={{ color: t.accent, textAlign: 'center', paddingVertical: 12 }}>
        Graph stress test (150 synthetic people)
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  score: { fontSize: 56, fontWeight: '700' },
  explanation: { marginTop: 4, lineHeight: 20 },
});
