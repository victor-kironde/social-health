import { DAY, DEFAULT_CONFIG, computeScore, explain } from '@sg/score-engine';
import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dbStatus, type DbStatus } from '../data/db';
import { HEALTH_LABELS, relationshipHealth, scoreOutOf10 } from '../data/health';
import { DEFAULT_ITERATIONS } from '../data/exportCrypto';
import { kdfSelfTest } from '../data/nativeKdf';
import { scenarioToEvents } from '../data/sampleData';
import { useStore } from '../data/store';
import { SCENARIOS, SCENARIO_AS_OF, SCENARIO_GROUPS, findScenario, scenarioNames } from '../data/scenarioCatalog';
import { NODE_SIZES, orderTiers } from '../graph/arrange';
import { networkMetrics } from '../graph/metrics';
import { deriveTies } from '../graph/ties';
import { Button, Card, ChoiceChips, Label } from '../ui/components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS } from '../ui/labels';
import { ScoreBreakdown } from '../ui/ScoreBreakdown';
import { ScoreRing } from '../ui/ScoreRing';
import { useTheme } from '../ui/theme';

const RETIRED = new Set(['archived', 'in_memoriam']);

/**
 * Developer screen: the engine on every synthetic scenario (score, parts and weights, each
 * relationship's health and graph size, network structure, what 30 quiet days would do), a way
 * to open any scenario as a graph, and storage and encryption diagnostics.
 */
export default function Preview() {
  const t = useTheme();
  const [selected, setSelected] = useState('closeKnit');
  const [db, setDb] = useState<DbStatus | { error: string } | null>(null);
  const { log: myLog, loadSample } = useStore();
  const [kdf, setKdf] = useState<{ correct: boolean; ms: number } | { error: string } | null>(null);

  useEffect(() => {
    dbStatus()
      .then(setDb)
      .catch((e: unknown) => setDb({ error: String(e) }));
  }, []);

  const scenario = findScenario(selected)!;
  const view = useMemo(() => {
    const log = scenario.build();
    const result = computeScore(log, DEFAULT_CONFIG, SCENARIO_AS_OF);
    const later = computeScore(log, DEFAULT_CONFIG, SCENARIO_AS_OF + 30 * DAY);
    const shown = result.relationships.filter((r) => !RETIRED.has(r.state));
    const ids = new Set(shown.map((r) => r.personId));
    const ties = deriveTies(log.interactions, SCENARIO_AS_OF, ids);
    const metrics = networkMetrics([...ids], ties.map((x) => ({ a: x.a, b: x.b, weight: x.weight })));
    const sizes = orderTiers(shown, 'frequency');
    return {
      result,
      later,
      explanations: explain(result, later),
      names: scenarioNames(log),
      shown,
      retired: result.relationships.length - shown.length,
      sizes,
      ties,
      metrics,
      calls: log.calls?.length ?? null,
      interactions: log.interactions.length,
    };
  }, [scenario]);
  const { result, later } = view;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={{ color: t.muted, lineHeight: 19 }}>
        The scoring engine (model v{result.modelVersion}) on {SCENARIOS.length} synthetic scenarios, as of{' '}
        {new Date(SCENARIO_AS_OF).toISOString().slice(0, 10)}. Nothing here touches your own data.
      </Text>

      {SCENARIO_GROUPS.map((group) => (
        <View key={group} style={{ gap: 6 }}>
          <Label>{group}</Label>
          <ChoiceChips
            options={SCENARIOS.filter((x) => x.group === group).map((x) => ({ value: x.id, label: x.label }))}
            value={selected}
            onChange={setSelected}
          />
        </View>
      ))}

      <Card>
        <Label>{scenario.label}</Label>
        <Text style={{ color: t.muted, lineHeight: 19 }}>{scenario.description}</Text>
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
          {view.shown.length} people{view.retired ? ` (+${view.retired} archived or in memoriam)` : ''} ·{' '}
          {view.interactions} logged catch-ups
          {view.calls === null ? ' · call history not connected' : ` · ${view.calls} calls`}
        </Text>
        <View style={{ marginTop: 10 }}>
          <Button
            title="View as graph"
            variant="secondary"
            onPress={() => router.push({ pathname: '/graph', params: { scenario: scenario.id } })}
          />
        </View>
        {myLog.people.length === 0 && (
          <View style={{ marginTop: 8 }}>
            <Button
              title="Use as my data (empty app only)"
              variant="secondary"
              onPress={() =>
                Alert.alert(
                  'Use this scenario as your data?',
                  'Its people and catch-ups are copied into the app as if they were yours, dated up to today. Use Settings → Delete everything to start again.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Use it',
                      onPress: () =>
                        loadSample(scenarioToEvents(scenario.build(), SCENARIO_AS_OF, Date.now()))
                          .then(() => router.dismissAll())
                          .catch((e: unknown) => Alert.alert('Could not load it', String(e))),
                    },
                  ],
                )
              }
            />
          </View>
        )}
      </Card>

      <Card>
        <Label>Social Health</Label>
        <View style={styles.scoreRow}>
          <ScoreRing total={result.total} size={88} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>
              {scoreOutOf10(result.total)} out of 10
            </Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>Engine total {result.total.toFixed(1)} / 100</Text>
            <Text style={{ color: result.lowData ? t.warn : t.muted, fontSize: 12 }}>
              {result.lowData ? `Low data: confidence ${result.confidence.toFixed(2)}` : `Confidence ${result.confidence.toFixed(2)}`}
            </Text>
          </View>
        </View>
        <ScoreBreakdown result={result} showWeights />
      </Card>

      <Card style={{ gap: 0 }}>
        <Label>Each relationship (as drawn on the graph)</Label>
        <View style={[styles.tableHead, { borderBottomColor: t.border }]}>
          <Text style={[styles.colName, styles.th, { color: t.muted }]}>Person</Text>
          <Text style={[styles.colHealth, styles.th, { color: t.muted }]}>Health</Text>
          <Text style={[styles.colNum, styles.th, { color: t.muted }]}>Ideal</Text>
          <Text style={[styles.colNum, styles.th, { color: t.muted }]}>Size</Text>
          <Text style={[styles.colNum, styles.th, { color: t.muted }]}>Last</Text>
        </View>
        {view.shown.map((r) => {
          const health = relationshipHealth(r);
          const size = view.sizes.get(r.personId)!;
          return (
            <View key={r.personId} style={styles.tableRow}>
              <View style={styles.colName}>
                <Text style={{ color: t.text }} numberOfLines={1}>
                  {view.names.get(r.personId)}
                </Text>
                <Text style={{ color: t.muted, fontSize: 11 }} numberOfLines={1}>
                  {[r.category, ...r.alsoCategories].map((c) => CATEGORY_LABELS[c]).join(' + ')} ·{' '}
                  {IMPORTANCE_LABELS[r.importance]}
                  {r.quality !== null ? ` · rated ${r.quality}` : ''}
                </Text>
              </View>
              <View style={[styles.colHealth, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                <View style={[styles.dot, { backgroundColor: t.health[health] }]} />
                <Text style={{ color: t.text, fontSize: 12 }} numberOfLines={1}>
                  {HEALTH_LABELS[health]}
                </Text>
              </View>
              <Text style={[styles.colNum, { color: t.text, fontSize: 12 }]}>{r.ideal ?? '–'}</Text>
              <Text style={[styles.colNum, { color: t.text, fontSize: 12 }]}>
                {size} ({NODE_SIZES[size]})
              </Text>
              <Text style={[styles.colNum, { color: t.muted, fontSize: 12 }]}>
                {r.lastContactAgeDays === null ? 'never' : `${Math.floor(r.lastContactAgeDays)}d`}
              </Text>
            </View>
          );
        })}
        <Text style={{ color: t.muted, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
          Ideal is how close the user hopes to be (– = don't mind, left out of the score). Health is the weaker of the rating and keeping to rhythm; lost touch after 3× the rhythm. Size is the
          catch-up frequency step (1 not yet caught up … 5 most in touch) and its radius.
        </Text>
      </Card>

      <Card>
        <Label>Network structure (from catch-ups with several people)</Label>
        {view.ties.length === 0 ? (
          <Text style={{ color: t.muted, lineHeight: 19 }}>
            No catch-up included two people, so there are no links or groups. Try "Two circles and a bridge".
          </Text>
        ) : (
          <Text style={{ color: t.text, lineHeight: 20 }}>
            {view.ties.length} links · {view.metrics.groups} {view.metrics.groups === 1 ? 'group' : 'groups'} ·{' '}
            {[...view.metrics.nodes.values()].filter((m) => m.groupsTouched >= 2).length} connecting groups · density{' '}
            {view.metrics.density.toFixed(2)} · effective size {view.metrics.effectiveSize.toFixed(1)} of{' '}
            {view.metrics.size}
          </Text>
        )}
      </Card>

      <Card>
        <Label>
          If 30 days pass with no catch-ups ({scoreOutOf10(result.total)} → {scoreOutOf10(later.total)} out of 10)
        </Label>
        {view.explanations.length === 0 ? (
          <Text style={{ color: t.text }}>No notable changes.</Text>
        ) : (
          view.explanations.map((e, i) => (
            <Text key={i} style={[styles.explanation, { color: t.text }]}>
              • {e.text}
            </Text>
          ))
        )}
      </Card>

      <Link href={{ pathname: '/graph', params: { demo: '150' } }} style={{ color: t.accent, textAlign: 'center', paddingVertical: 12 }}>
        Graph stress test (150 synthetic people)
      </Link>

      <Label>Diagnostics</Label>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 6 },
  explanation: { marginTop: 4, lineHeight: 20 },
  tableHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  th: { fontSize: 11 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  colName: { flex: 1 },
  colHealth: { width: 104 },
  colNum: { width: 46, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
