import type { Explanation, ScoreResult } from './types';

export function explain(
  _prev: ScoreResult,
  _curr: ScoreResult,
  _opts: { threshold?: number } = {},
): Explanation[] {
  throw new Error('not implemented');
}
