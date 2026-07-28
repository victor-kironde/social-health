import type { ComponentName, ScoreResult } from '@sg/score-engine';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

export const COMPONENT_LABELS: [ComponentName, string][] = [
  ['rhythm', 'Contact rhythm'],
  ['coverage', 'Important relationships covered'],
  ['diversity', 'Balance across categories'],
  ['quality', 'Quality and support'],
];

/** One labelled bar per score component, so the total never hides a weak part. */
export function ScoreBreakdown({ result }: { result: ScoreResult }) {
  const t = useTheme();
  return (
    <View>
      {COMPONENT_LABELS.map(([key, label]) => {
        const v = result.components[key];
        const pct = v === null ? null : Math.round(v * 100);
        return (
          <View
            key={key}
            style={styles.row}
            accessible
            accessibilityLabel={`${label}: ${pct === null ? 'not enough information' : `${pct} out of 100`}`}
          >
            <View style={styles.head}>
              <Text style={{ color: t.text }}>{label}</Text>
              <Text style={{ color: t.muted }}>{pct === null ? 'n/a' : pct}</Text>
            </View>
            <View style={[styles.track, { backgroundColor: t.track }]}>
              <View style={[styles.fill, { width: `${pct ?? 0}%`, backgroundColor: t.accent }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
