import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { ScenarioBuilder } from '@sg/synth';
import { describe, expect, it } from 'vitest';
import { restrictLog } from '../src/data/subset';

const AS_OF = Date.UTC(2026, 6, 1);

function network() {
  const b = new ScenarioBuilder(AS_OF);
  b.person('mum', { category: 'family', importance: 5, rhythm: 'monthly' });
  b.person('ana', { category: 'friend', importance: 5, rhythm: 'monthly' });
  b.person('old', { category: 'friend', importance: 5, rhythm: 'monthly' });
  b.contactEvery('mum', 30, { toDaysAgo: 2 });
  b.contactEvery(['mum', 'ana'], 30, { toDaysAgo: 5 });
  b.contactEvery('old', 30, { fromDaysAgo: 365, toDaysAgo: 200 });
  b.connectCalls();
  b.call('ana', 3);
  return b.build();
}

describe('restrictLog (scoring a filtered view)', () => {
  it('keeps only the chosen people, trimming group catch-ups to them', () => {
    const sub = restrictLog(network(), new Set(['ana']));
    expect(sub.people.map((p) => p.id)).toEqual(['ana']);
    expect(sub.interactions.every((x) => x.participants.join() === 'ana')).toBe(true);
    expect(sub.interactions.length).toBeGreaterThan(0);
    expect(sub.calls!.every((c) => c.personId === 'ana')).toBe(true);
  });

  it('scores the subset on its own: leaving out a lost friend raises the score', () => {
    const log = network();
    const all = computeScore(log, DEFAULT_CONFIG, AS_OF).total;
    const close = computeScore(restrictLog(log, new Set(['mum', 'ana'])), DEFAULT_CONFIG, AS_OF).total;
    const lost = computeScore(restrictLog(log, new Set(['old'])), DEFAULT_CONFIG, AS_OF).total;
    expect(close).toBeGreaterThan(all);
    expect(lost).toBeLessThan(all);
  });

  it('keeps "not connected" calls as not connected', () => {
    const log = { ...network() };
    delete log.calls;
    expect(restrictLog(log, new Set(['mum'])).calls).toBeUndefined();
  });
});
