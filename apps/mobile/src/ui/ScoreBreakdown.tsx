import { DEFAULT_CONFIG, type ComponentName, type ScoreResult } from '@sg/score-engine';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

export const COMPONENT_LABELS: [ComponentName, string][] = [
  ['rhythm', 'Contact rhythm'],
  ['coverage', 'Important relationships covered'],
  ['calls', 'Calls'],
  ['diversity', 'Balance across types'],
  ['quality', 'Quality and support'],
  ['frecency', 'Recent and frequent contact'],
];

/** One labelled bar per score component, so the total never hides a weak part. */
export function ScoreBreakdown({ result, showWeights = false }: { result: ScoreResult; showWeights?: boolean }) {
  const t = useTheme();
  return (
    <View>
      {COMPONENT_LABELS.map(([key, label]) => {
        const v = result.components[key];
        const pct = v === null ? null : Math.round(v * 100);
        // Shown out of 10, like the overall score.
        const outOf10 = v === null ? null : (v * 10).toFixed(1);
        return (
          <View
            key={key}
            style={styles.row}
            accessible
            accessibilityLabel={`${label}: ${outOf10 === null ? 'not enough information' : `${outOf10} out of 10`}`}
          >
            <View style={styles.head}>
              <Text style={{ color: t.text }}>
                {label}
                {showWeights && (
                  <Text style={{ color: t.muted, fontSize: 12 }}>
                    {'  '}weight {DEFAULT_CONFIG.componentWeights[key].toFixed(2)}
                  </Text>
                )}
              </Text>
              <Text style={{ color: t.muted }}>{outOf10 === null ? 'n/a' : outOf10}</Text>
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
