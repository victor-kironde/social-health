import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { HEALTH_LABELS, relationshipHealth, scoreOutOf10, type HealthBand } from '../data/health';
import { usePrefs } from '../data/prefs';
import { useStore } from '../data/store';
import { Card, Label } from '../ui/components';
import { ScoreBreakdown } from '../ui/ScoreBreakdown';
import { ScoreRing } from '../ui/ScoreRing';
import { useTheme } from '../ui/theme';

const RETIRED = new Set(['archived', 'in_memoriam']);
const BANDS: HealthBand[] = [5, 4, 3, 2, 1, 'lost'];

/** Details behind the Social Health score. Charts of how it changes over time come next. */
export default function ScoreDetails() {
  const t = useTheme();
  const { log } = useStore();
  const { prefs } = usePrefs();
  const result = useMemo(() => computeScore(log, DEFAULT_CONFIG, Date.now()), [log]);
  const counts = useMemo(() => {
    const c = new Map<HealthBand, number>(BANDS.map((b) => [b, 0]));
    for (const r of result.relationships) if (!RETIRED.has(r.state)) c.set(relationshipHealth(r), c.get(relationshipHealth(r))! + 1);
    return c;
  }, [result]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {prefs.showScore && log.interactions.length === 0 && (
        <Card>
          <Text style={{ color: t.text, lineHeight: 20 }}>Log your first catch-up to see your score.</Text>
        </Card>
      )}
      {prefs.showScore && log.interactions.length > 0 && (
        <Card>
          <View style={styles.head}>
            <ScoreRing total={result.total} size={120} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>
                {scoreOutOf10(result.total)} out of 10
              </Text>
              <Text style={{ color: t.muted, lineHeight: 19 }}>
                A summary of how you are keeping in touch with the people who matter to you.
              </Text>
              {result.lowData && <Text style={{ color: t.warn }}>Based on little recent logging, so less certain.</Text>}
            </View>
          </View>
        </Card>
      )}

      <Card>
        <Label>Your relationships</Label>
        {BANDS.map((b) => (
          <View key={String(b)} style={styles.bandRow}>
            <View style={[styles.dot, { backgroundColor: t.health[b] }]} />
            <Text style={{ color: t.text, flex: 1 }}>{HEALTH_LABELS[b]}</Text>
            <Text style={{ color: t.muted }}>{counts.get(b)}</Text>
          </View>
        ))}
      </Card>

      {prefs.showScore && log.interactions.length > 0 && (
        <Card>
          <Label>What makes up the score</Label>
          <ScoreBreakdown result={result} />
        </Card>
      )}

      <Card>
        <Label>Trends</Label>
        <Text style={{ color: t.muted, lineHeight: 20 }}>Charts of how your score and relationships change over time are coming soon.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
