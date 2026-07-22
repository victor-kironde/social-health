import { DAY, DEFAULT_CONFIG, computeScore, explain, type ComponentName, type EventLog } from '@sg/score-engine';
import * as scenarios from '@sg/synth/scenarios';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { dbStatus, type DbStatus } from './src/db';

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

export default function App() {
  const dark = useColorScheme() === 'dark';
  const c = dark ? palette.dark : palette.light;
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
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: c.text }]}>Social Health Score</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          Engine preview · model v{result.modelVersion} · synthetic scenarios
        </Text>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.label, { color: c.muted }]}>Encrypted storage</Text>
          <Text style={{ color: c.text }}>
            {db === null
              ? 'Opening database…'
              : 'error' in db
                ? `Error: ${db.error}`
                : db.cipherVersion
                  ? `SQLCipher ${db.cipherVersion} active · ${db.eventCount} events`
                  : 'Not encrypted: SQLCipher is not active'}
          </Text>
        </View>

        <View style={styles.chips}>
          {Object.keys(SCENARIOS).map((name) => (
            <Pressable
              key={name}
              onPress={() => setSelected(name)}
              style={[styles.chip, { backgroundColor: name === selected ? c.accent : c.card }]}
            >
              <Text style={{ color: name === selected ? c.onAccent : c.text }}>{name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.score, { color: c.text }]}>{Math.round(result.total)}</Text>
          <Text style={{ color: result.lowData ? c.warn : c.muted }}>
            {result.lowData
              ? `Low data (confidence ${result.confidence.toFixed(2)}): treat this score as uncertain`
              : `Confidence ${result.confidence.toFixed(2)}`}
          </Text>
          {COMPONENTS.map(([key, label]) => {
            const v = result.components[key];
            return (
              <View key={key} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={{ color: c.text }}>{label}</Text>
                  <Text style={{ color: c.muted }}>{v === null ? 'n/a' : Math.round(v * 100)}</Text>
                </View>
                <View style={[styles.track, { backgroundColor: c.track }]}>
                  <View style={[styles.fill, { width: `${(v ?? 0) * 100}%`, backgroundColor: c.accent }]} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: c.card }]}>
          <Text style={[styles.label, { color: c.muted }]}>
            If 30 days pass with no contact ({Math.round(result.total)} → {Math.round(later.total)})
          </Text>
          {explanations.length === 0 ? (
            <Text style={{ color: c.text }}>No notable changes.</Text>
          ) : (
            explanations.map((e, i) => (
              <Text key={i} style={[styles.explanation, { color: c.text }]}>
                • {e.text}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const palette = {
  light: { bg: '#f6f7f9', card: '#ffffff', text: '#16181d', muted: '#5d6470', accent: '#2f6fde', onAccent: '#ffffff', track: '#e3e6eb', warn: '#a8570a' },
  dark: { bg: '#101215', card: '#1b1e23', text: '#eceef1', muted: '#9aa1ad', accent: '#6e9cf0', onAccent: '#0b1220', track: '#2c3038', warn: '#f0a75a' },
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingTop: 56, gap: 12 },
  title: { fontSize: 26, fontWeight: '700' },
  muted: { fontSize: 13 },
  label: { fontSize: 13, marginBottom: 6 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  score: { fontSize: 56, fontWeight: '700' },
  row: { marginTop: 10 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  explanation: { marginTop: 4, lineHeight: 20 },
});
