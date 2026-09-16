import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { logFromRows, toRow } from '../src/data/codec';
import { scenarioToEvents } from '../src/data/sampleData';
import { SCENARIO_AS_OF, findScenario } from '../src/data/scenarioCatalog';

describe('loading a scenario as sample data', () => {
  it('scores the same today as the scenario did on its own date', () => {
    for (const id of ['circles', 'callsRegular', 'busyPaused', 'ratedStrained']) {
      const log = findScenario(id)!.build();
      const now = Date.UTC(2026, 9, 8, 12);
      const loaded = logFromRows(scenarioToEvents(log, SCENARIO_AS_OF, now).map(toRow));
      const before = computeScore(log, DEFAULT_CONFIG, SCENARIO_AS_OF).total;
      const after = computeScore(loaded, DEFAULT_CONFIG, now).total;
      expect(after).toBeCloseTo(before, 6);
      expect(loaded.people.every((p) => p.id.startsWith('sample-'))).toBe(true);
    }
  });
});
