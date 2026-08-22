import type { CallRecord, Interaction, RelationshipContribution } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import type { NodeMetrics } from '../src/graph/metrics';
import { personStats } from '../src/graph/personStats';

const NOW = Date.UTC(2026, 9, 8);
const DAY = 86_400_000;

const rel = (personId: string, frecency: number) => ({ personId, frecency }) as RelationshipContribution;
const meet = (id: string, daysAgo: number, participants: string[]) =>
  ({ id, ts: NOW - daysAgo * DAY, loggedAt: NOW, type: 'in_person', participants, source: 'manual' }) as Interaction;
const call = (id: string, personId: string, daysAgo: number, durationSec: number, direction: CallRecord['direction'] = 'outgoing'): CallRecord => ({
  id,
  personId,
  ts: NOW - daysAgo * DAY,
  durationSec,
  direction,
});
const m = (over: Partial<NodeMetrics>): NodeMetrics => ({
  degree: 0,
  strength: 0,
  clustering: 0,
  betweenness: 0,
  group: 0,
  groupSize: 1,
  groupsTouched: 1,
  ...over,
});

describe('personStats', () => {
  const rels = [rel('a', 5), rel('b', 9), rel('c', 0)];

  it('ranks by frecency among people with any contact', () => {
    expect(personStats('a', rels, [], undefined, new Map(), NOW)).toMatchObject({ frequencyRank: 2, contacted: 2 });
    expect(personStats('c', rels, [], undefined, new Map(), NOW).frequencyRank).toBeNull();
  });

  it('counts logged contacts in the last 90 days, including group ones', () => {
    const xs = [meet('1', 3, ['a']), meet('2', 40, ['a', 'b']), meet('3', 120, ['a']), meet('4', 5, ['b'])];
    expect(personStats('a', rels, xs, undefined, new Map(), NOW).loggedRecent).toBe(2);
  });

  it('counts answered calls and minutes, and says when calls are not connected', () => {
    const calls = [call('1', 'a', 2, 300), call('2', 'a', 10, 90), call('3', 'a', 4, 0, 'missed'), call('4', 'a', 200, 600)];
    expect(personStats('a', rels, [], calls, new Map(), NOW).callsRecent).toEqual({ count: 2, minutes: 7 });
    expect(personStats('a', rels, [], undefined, new Map(), NOW).callsRecent).toBeNull();
  });

  it('reports network position from the metrics', () => {
    const metrics = new Map([['a', m({ degree: 3, group: 1, groupSize: 4, groupsTouched: 2 })]]);
    expect(personStats('a', rels, [], undefined, metrics, NOW)).toMatchObject({
      knows: 3,
      group: { index: 1, size: 4 },
      bridge: true,
    });
    expect(personStats('b', rels, [], undefined, metrics, NOW)).toMatchObject({ knows: 0, group: null, bridge: false });
  });
});
