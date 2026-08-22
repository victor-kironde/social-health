import type { CallRecord, Interaction, RelationshipContribution } from '@sg/score-engine';
import type { NodeMetrics } from './metrics';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Window for the "recent" counts in the stats card. */
export const RECENT_WINDOW_DAYS = 90;

/** Person-specific figures for the graph's stats card. Pure, so it is tested without the UI. */
export interface PersonStats {
  /** 1 = most in touch (by frecency) among people with any contact; null if never contacted. */
  frequencyRank: number | null;
  /** People with any contact at all (the rank's denominator). */
  contacted: number;
  /** Logged contacts with them in the last RECENT_WINDOW_DAYS. */
  loggedRecent: number;
  /** Answered calls in the window, and their total minutes; null when call history is not connected. */
  callsRecent: { count: number; minutes: number } | null;
  /** People in the network they have been seen with (inferred ties). */
  knows: number;
  /** Their community, when it has two or more people. */
  group: { index: number; size: number } | null;
  /** Their ties reach into another group. */
  bridge: boolean;
}

export function personStats(
  personId: string,
  relationships: RelationshipContribution[],
  interactions: Interaction[],
  calls: CallRecord[] | undefined,
  metrics: Map<string, NodeMetrics>,
  now: number,
): PersonStats {
  const since = now - RECENT_WINDOW_DAYS * DAY_MS;
  const ranked = relationships
    .filter((r) => r.frecency > 0)
    .sort((a, b) => b.frecency - a.frecency || (a.personId < b.personId ? -1 : 1));
  const rank = ranked.findIndex((r) => r.personId === personId);
  const recentCalls = calls?.filter((c) => c.personId === personId && c.ts >= since && c.direction !== 'missed');
  const m = metrics.get(personId);
  return {
    frequencyRank: rank < 0 ? null : rank + 1,
    contacted: ranked.length,
    loggedRecent: interactions.filter((x) => x.ts >= since && x.ts <= now && x.participants.includes(personId)).length,
    callsRecent: recentCalls
      ? { count: recentCalls.length, minutes: Math.round(recentCalls.reduce((s, c) => s + c.durationSec, 0) / 60) }
      : null,
    knows: m?.degree ?? 0,
    group: m && m.groupSize >= 2 ? { index: m.group, size: m.groupSize } : null,
    bridge: (m?.groupsTouched ?? 1) >= 2,
  };
}
