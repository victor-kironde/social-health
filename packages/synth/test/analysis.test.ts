import { DEFAULT_CONFIG } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { AS_OF } from '../src';
import {
  COMPONENTS,
  ORDERINGS,
  contributions,
  pearson,
  ranks,
  scoreAll,
  spearman,
  varianceShares,
  violatedOrderings,
} from '../src/analysis';

describe('statistics helpers', () => {
  it('ranks with ties sharing the average rank', () => {
    expect(ranks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });

  it('pearson and spearman agree with hand-worked values', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 12); // monotone but not linear
  });

  it('contributions renormalise over defined components and sum to the total', () => {
    const comps = { rhythm: 0.5, coverage: 1, quality: null, diversity: 0.5, calls: null, frecency: 0.2 };
    const c = contributions(comps, DEFAULT_CONFIG.componentWeights);
    expect(c.quality).toBe(0);
    expect(c.calls).toBe(0);
    const sum = COMPONENTS.reduce((a, k) => a + c[k], 0);
    const w = DEFAULT_CONFIG.componentWeights;
    const expected = (100 * (w.rhythm * 0.5 + w.coverage * 1 + w.diversity * 0.5 + w.frecency * 0.2)) / (w.rhythm + w.coverage + w.diversity + w.frecency);
    expect(sum).toBeCloseTo(expected, 9);
  });

  it('variance shares sum to 1', () => {
    const samples = [
      { rhythm: 10, coverage: 20, quality: 0, diversity: 5, calls: 3, frecency: 1 },
      { rhythm: 30, coverage: 10, quality: 5, diversity: 5, calls: 0, frecency: 2 },
      { rhythm: 5, coverage: 25, quality: 10, diversity: 2, calls: 8, frecency: 4 },
    ];
    const shares = varianceShares(samples);
    expect(COMPONENTS.reduce((a, c) => a + shares[c], 0)).toBeCloseTo(1, 9);
  });
});

describe('baseline model', () => {
  it('satisfies every expected ordering', () => {
    expect(violatedOrderings(scoreAll(DEFAULT_CONFIG, AS_OF))).toEqual([]);
    expect(ORDERINGS.length).toBeGreaterThanOrEqual(8);
  });
});
