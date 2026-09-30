import { DEFAULT_CONFIG, computeScore, type EventLog, type ModelConfig } from '@sg/score-engine';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SCENARIO_AS_OF, findScenario } from '../data/scenarioCatalog';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HEALTH_LABELS,
  IDEAL_COMPARISON_LABELS,
  compareToIdeal,
  personalHealth,
  relationshipHealth,
  scoreOutOf10,
  type HealthBand,
  type IdealComparison,
} from '../data/health';
import { usePrefs, useModelConfig } from '../data/prefs';
import { useStore } from '../data/store';
import { TREND_RANGES, trendChange, trendPoints, type TrendRange } from '../data/trends';
import { Card, ChoiceChips, Label } from '../ui/components';
import { CatchUpTrend, ClosenessTrend, ScoreTrend } from '../ui/TrendCharts';
import { ScoreBreakdown } from '../ui/ScoreBreakdown';
import { ScoreRing } from '../ui/ScoreRing';
import { useTheme } from '../ui/theme';

const RETIRED = new Set(['archived', 'in_memoriam']);
const BANDS: HealthBand[] = [5, 4, 3, 2, 1, 'lost'];
const COMPARISONS: IdealComparison[] = ['at', 'below', 'beyond', 'none'];

/** Details behind the Social Health score. Charts of how it changes over time come next. */
export default function ScoreDetails() {
  const { log: myLog } = useStore();
  const myConfig = useModelConfig();
  // A synthetic scenario (score?scenario=<id>), shown as of the scenarios' fixed date.
  const { scenario: scenarioId } = useLocalSearchParams<{ scenario?: string }>();
  const scenario = findScenario(scenarioId);
  const log = useMemo(() => (scenario ? scenario.build() : myLog), [scenario, myLog]);
  const config = scenario ? DEFAULT_CONFIG : myConfig;
  const now = useMemo(() => (scenario ? SCENARIO_AS_OF : Date.now()), [scenario]);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {scenario && <Stack.Screen options={{ title: `Scenario: ${scenario.label}` }} />}
      <ScoreDetailsBody log={log} config={config} now={now} />
    </ScrollView>
  );
}

/**
 * The score, how relationships stand, what makes up the score, and trends. Used by the page and
 * by the pane that floats over the graph (`floating`: see-through cards).
 */
export function ScoreDetailsBody({ log, config, now, floating = false }: { log: EventLog; config: ModelConfig; now: number; floating?: boolean }) {
  const t = useTheme();
  const { prefs } = usePrefs();
  const cardStyle = floating ? { backgroundColor: `${t.bg}66` } : undefined;
  const result = useMemo(() => computeScore(log, config, now), [log, config, now]);
  const [range, setRange] = useState<TrendRange>('5m');
  const points = useMemo(() => trendPoints(log, now, range, config), [log, now, range, config]);
  const change = trendChange(points, scoreOutOf10);
  // How each relationship stands against the ideal the user set for it.
  const vsIdeal = useMemo(() => {
    const c = new Map<IdealComparison, number>(COMPARISONS.map((k) => [k, 0]));
    for (const r of result.relationships) {
      if (RETIRED.has(r.state)) continue;
      const k = compareToIdeal(personalHealth(r).score, r.ideal);
      c.set(k, c.get(k)! + 1);
    }
    return c;
  }, [result]);
  const counts = useMemo(() => {
    const c = new Map<HealthBand, number>(BANDS.map((b) => [b, 0]));
    for (const r of result.relationships) if (!RETIRED.has(r.state)) c.set(relationshipHealth(r), c.get(relationshipHealth(r))! + 1);
    return c;
  }, [result]);

  return (
    <View style={{ gap: 12 }}>
      {prefs.showScore && log.interactions.length === 0 && (
        <Card style={cardStyle}>
          <Text style={{ color: t.text, lineHeight: 20 }}>Log your first catch-up to see your score.</Text>
        </Card>
      )}
      {prefs.showScore && log.interactions.length > 0 && (
        <Card style={cardStyle}>
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

      <Card style={cardStyle}>
        <Label>Your relationships</Label>
        {BANDS.map((b) => (
          <View key={String(b)} style={styles.bandRow}>
            <View style={[styles.dot, { backgroundColor: t.health[b] }]} />
            <Text style={{ color: t.text, flex: 1 }}>{HEALTH_LABELS[b]}</Text>
            <Text style={{ color: t.muted }}>{counts.get(b)}</Text>
          </View>
        ))}
      </Card>

      <Card style={cardStyle}>
        <Label>Compared with how close you hope to be</Label>
        {COMPARISONS.map((k) => (
          <View key={k} style={styles.bandRow}>
            <Text style={{ color: t.text, flex: 1 }}>{IDEAL_COMPARISON_LABELS[k]}</Text>
            <Text style={{ color: t.muted }}>{vsIdeal.get(k)}</Text>
          </View>
        ))}
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
          Your score measures how close each relationship is to the ideal you set for it (10 unless you change it), so a
          relationship you want to keep distant counts as doing well when it is. "Don't mind" relationships are left out.
        </Text>
      </Card>

      {prefs.showScore && log.interactions.length > 0 && (
        <Card style={cardStyle}>
          <Label>What makes up the score</Label>
          <ScoreBreakdown result={result} />
        </Card>
      )}

      <Label>Trends</Label>
      <ChoiceChips
        options={(Object.keys(TREND_RANGES) as TrendRange[]).map((r) => ({ value: r, label: TREND_RANGES[r].label }))}
        value={range}
        onChange={setRange}
      />
      {prefs.showScore && log.interactions.length > 0 && (
        <Card style={cardStyle}>
          <Label>Social Health over time</Label>
          <Text style={{ color: t.muted, marginBottom: 6 }}>
            {change === null
              ? 'Not enough history yet.'
              : change === 0
                ? 'About the same as at the start of this period.'
                : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} since the start of this period.`}
          </Text>
          <ScoreTrend points={points} range={range} />
        </Card>
      )}
      <Card style={cardStyle}>
        <Label>How close your relationships have been</Label>
        <ClosenessTrend points={points} range={range} />
      </Card>
      <Card style={cardStyle}>
        <Label>Catch-ups {TREND_RANGES[range].stepDays === 1 ? 'per day' : TREND_RANGES[range].stepDays === 7 ? 'per week' : 'per month'}</Label>
        <CatchUpTrend points={points} range={range} showCalls={log.calls !== undefined} />
      </Card>
      <Text style={{ color: t.muted, fontSize: 12, lineHeight: 17 }}>
        Each point shows things as they were then. Social Health is for information and reflection only.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
