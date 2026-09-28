import { DAY } from '@sg/score-engine';
import { ScenarioBuilder } from '@sg/synth';
import { describe, expect, it } from 'vitest';
import { scoreOutOf10 } from '../src/data/health';
import { TREND_RANGES, trendChange, trendPoints } from '../src/data/trends';

const NOW = Date.UTC(2026, 9, 8);

function driftingApart() {
  // Monthly catch-ups with four friends until 90 days ago, then nothing.
  const b = new ScenarioBuilder(NOW);
  ['ana', 'ben', 'cleo', 'dev'].forEach((id) => {
    b.person(id, { category: 'friend', importance: 5, rhythm: 'monthly' }, 400);
    b.contactEvery(id, 30, { fromDaysAgo: 365, toDaysAgo: 90 });
  });
  return b.build();
}

describe('trends', () => {
  it('has the right number of points, ending now', () => {
    for (const range of ['1m', '3m', '5m', '1y'] as const) {
      const pts = trendPoints(driftingApart(), NOW, range);
      expect(pts).toHaveLength(TREND_RANGES[range].points);
      expect(pts[pts.length - 1]!.ts).toBe(NOW);
    }
  });

  it('shows the score falling and people drifting as catch-ups stop', () => {
    const pts = trendPoints(driftingApart(), NOW, '1y');
    const first = pts.find((p) => p.total !== null)!;
    const last = pts[pts.length - 1]!;
    expect(last.total!).toBeLessThan(first.total!);
    expect(trendChange(pts, scoreOutOf10)!).toBeLessThan(0);
    expect(last.bands.lost + last.bands[2] + last.bands[3]).toBe(4);
    expect(first.bands[5] + first.bands[4]).toBeGreaterThan(0);
  });

  it('counts each catch-up once, in the period it happened', () => {
    const log = driftingApart();
    const pts = trendPoints(log, NOW, '1y');
    const window = pts.reduce((s, p) => s + p.catchUps, 0);
    const start = NOW - 12 * 30 * DAY;
    expect(window).toBe(log.interactions.filter((x) => x.ts > start && x.ts <= NOW).length);
    expect(pts.slice(-2).every((p) => p.catchUps === 0)).toBe(true); // nothing in the last 60 days
  });

  it('has no score before anyone was added', () => {
    const b = new ScenarioBuilder(NOW);
    b.person('ana', { category: 'friend', importance: 5 }, 10);
    const pts = trendPoints(b.build(), NOW, '1m');
    expect(pts[0]!.total).toBeNull();
    expect(pts[pts.length - 1]!.total).not.toBeNull();
  });
});
