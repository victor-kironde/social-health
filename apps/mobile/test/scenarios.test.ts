import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { relationshipHealth } from '../src/data/health';
import { SCENARIOS, SCENARIO_AS_OF, SCENARIO_GROUPS, findScenario, scenarioNames } from '../src/data/scenarioCatalog';
import { networkMetrics } from '../src/graph/metrics';
import { deriveTies } from '../src/graph/ties';

describe('scenario catalogue (engine preview)', () => {
  it('has unique ids, known groups, and every scenario builds and scores', () => {
    expect(new Set(SCENARIOS.map((x) => x.id)).size).toBe(SCENARIOS.length);
    for (const x of SCENARIOS) {
      expect(SCENARIO_GROUPS).toContain(x.group);
      const result = computeScore(x.build(), DEFAULT_CONFIG, SCENARIO_AS_OF);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    }
    expect(findScenario('nope')).toBeUndefined();
    expect(findScenario(undefined)).toBeUndefined();
  });

  it('capitalises scenario ids as names', () => {
    expect(scenarioNames(findScenario('closeKnit')!.build()).get('mum')).toBe('Mum');
  });

  it('"Two circles and a bridge" shows two groups, a bridge and every kind of health', () => {
    const log = findScenario('circles')!.build();
    const rels = computeScore(log, DEFAULT_CONFIG, SCENARIO_AS_OF).relationships;
    const ids = rels.map((r) => r.personId);
    const ties = deriveTies(log.interactions, SCENARIO_AS_OF, new Set(ids));
    const metrics = networkMetrics(ids, ties.map((t) => ({ a: t.a, b: t.b, weight: t.weight })));
    expect(metrics.groups).toBeGreaterThanOrEqual(2);
    expect([...metrics.nodes.values()].some((m) => m.groupsTouched >= 2)).toBe(true);

    const health = new Map(rels.map((r) => [r.personId, relationshipHealth(r)]));
    expect(health.get('mum')).toBe(5);
    expect(health.get('lee')).toBe(2); // rated strained
    expect(health.get('zoe')).toBe('lost'); // 200 days on a monthly rhythm
    expect(health.get('nia')).toBe('lost'); // never contacted
    expect(rels.find((r) => r.personId === 'kim')!.alsoCategories).toEqual(['family']);
  });
});
