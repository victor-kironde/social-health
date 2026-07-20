import { describe, expect, it } from 'vitest';
import { ScenarioBuilder } from '@sg/synth';
import { DAY, DEFAULT_CONFIG, computeScore, explain } from '../src';

const AS_OF = Date.UTC(2026, 6, 1);

function network(seenRecently: boolean) {
  const b = new ScenarioBuilder(AS_OF);
  ['a', 'b', 'c'].forEach((id) => {
    b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' });
    b.contact(id, seenRecently ? 5 : 75);
  });
  return b;
}

describe('explain', () => {
  it('reports nothing when nothing changed', () => {
    const r = computeScore(network(true).build(), DEFAULT_CONFIG, AS_OF);
    expect(explain(r, r).filter((e) => e.kind !== 'low_data')).toEqual([]);
  });

  it('reports component drops and which relationships fell behind', () => {
    const log = network(true).build();
    const prev = computeScore(log, DEFAULT_CONFIG, AS_OF);
    const curr = computeScore(log, DEFAULT_CONFIG, AS_OF + 60 * DAY);
    const out = explain(prev, curr);

    const fell = out.find((e) => e.kind === 'fell_behind');
    expect(fell?.personIds?.sort()).toEqual(['a', 'b', 'c']);
    const coverage = out.find((e) => e.kind === 'component_change' && e.component === 'coverage');
    expect(coverage?.delta).toBeLessThan(0);
  });

  it('reports relationships back on rhythm', () => {
    const before = network(false);
    const prev = computeScore(before.build(), DEFAULT_CONFIG, AS_OF);
    const curr = computeScore(before.contact(['a', 'b', 'c'], 0).build(), DEFAULT_CONFIG, AS_OF);
    expect(explain(prev, curr).find((e) => e.kind === 'back_on_rhythm')?.personIds?.sort()).toEqual(['a', 'b', 'c']);
  });

  it('mentions importance changes so coverage gains are not misread', () => {
    const b = network(false);
    const prev = computeScore(b.build(), DEFAULT_CONFIG, AS_OF);
    b.change('a', { field: 'importance', value: 2 }, AS_OF);
    const curr = computeScore(b.build(), DEFAULT_CONFIG, AS_OF);
    expect(explain(prev, curr).find((e) => e.kind === 'importance_changed')?.personIds).toEqual(['a']);
  });

  it('ignores component changes below the threshold', () => {
    const log = network(true).build();
    const prev = computeScore(log, DEFAULT_CONFIG, AS_OF);
    const curr = computeScore(log, DEFAULT_CONFIG, AS_OF + DAY);
    expect(explain(prev, curr, { threshold: 0.05 }).filter((e) => e.kind === 'component_change')).toEqual([]);
  });

  it('flags low data', () => {
    const b = new ScenarioBuilder(AS_OF);
    b.person('a', { category: 'friend' });
    b.contact('a', 60);
    const r = computeScore(b.build(), DEFAULT_CONFIG, AS_OF);
    expect(explain(r, r).some((e) => e.kind === 'low_data')).toBe(true);
  });

  it('uses descriptive rather than prescriptive wording', () => {
    const log = network(true).build();
    const out = explain(computeScore(log, DEFAULT_CONFIG, AS_OF), computeScore(log, DEFAULT_CONFIG, AS_OF + 60 * DAY));
    for (const e of out) expect(e.text).not.toMatch(/\b(should|must|need to|try to)\b/i);
  });
});
