import type { Category, Rating, RelationshipContribution } from '@sg/score-engine';
import { importanceBand } from '../ui/labels';
import { NODE_RADIUS, SECTOR_ORDER, type Point } from './layout';

/**
 * Display choices that change where people sit or how big they are, kept
 * pure so the graph screen and tests share them: node size from contact
 * frequency, the "order by" key that picks each person's ring or row, and
 * the tiers (list) arrangement.
 */

/**
 * Five distinct sizes, from never in touch to most in touch. Discrete steps (each about 1.3
 * times the last, so the area nearly doubles each step) read far more clearly than a smooth
 * scale, and small changes in contact do not resize anyone.
 */
export const NODE_SIZES: Record<Rating, number> = { 1: 10, 2: 14, 3: 19, 4: 25, 5: 32 };
export const MIN_NODE_RADIUS = NODE_SIZES[1];
export const MAX_NODE_RADIUS = NODE_SIZES[5];

/**
 * Radius per person from how much and how recently you have been in touch (frecency), in five
 * steps: never contacted is the smallest, and the rest are ranked into four steps (see
 * orderTiers), so sizes compare people with each other.
 */
export function nodeRadii(relationships: RelationshipContribution[], bySize: boolean): Map<string, number> {
  if (!bySize) return new Map(relationships.map((r) => [r.personId, NODE_RADIUS]));
  const tiers = orderTiers(relationships, 'frequency');
  return new Map(relationships.map((r) => [r.personId, NODE_SIZES[tiers.get(r.personId)!]]));
}

export type OrderBy = 'importance' | 'frequency' | 'recent';

export const ORDER_LABELS: Record<OrderBy, string> = {
  importance: 'Importance',
  frequency: 'Catch-up frequency',
  recent: 'Last catch-up',
};

/** What sitting closer (or higher) means for each order, for the graph's key. */
export const ORDER_MEANING: Record<OrderBy, string> = {
  importance: 'more important',
  frequency: 'more catch-ups',
  recent: 'caught up more recently',
};

/** What each tier means, top (5, innermost ring) to bottom (1, outermost). */
export const TIER_LABELS: Record<OrderBy, Record<Rating, string>> = {
  importance: { 5: 'Essential', 4: 'Very important', 3: 'Important', 2: 'Somewhat', 1: 'Light' },
  frequency: { 5: 'Most in touch', 4: 'Often', 3: 'Sometimes', 2: 'Rarely', 1: 'Not yet' },
  recent: { 5: 'This week', 4: 'This month', 3: 'Last 3 months', 2: 'Longer ago', 1: 'Never' },
};

/**
 * Tier 1-5 per person for the chosen key; 5 sits closest to you (inner ring,
 * top row). Frequency is ranked into fifths among people with any contact,
 * so tiers stay meaningful however much is logged.
 */
export function orderTiers(relationships: RelationshipContribution[], by: OrderBy): Map<string, Rating> {
  // Importance 1–10 falls into five rings by its guide range (1–2 outermost … 9–10 innermost).
  if (by === 'importance') return new Map(relationships.map((r) => [r.personId, importanceBand(r.importance)]));
  if (by === 'recent') {
    return new Map(
      relationships.map((r) => {
        const age = r.lastContactAgeDays;
        const tier: Rating = age === null ? 1 : age <= 7 ? 5 : age <= 30 ? 4 : age <= 90 ? 3 : 2;
        return [r.personId, tier];
      }),
    );
  }
  const contacted = relationships
    .filter((r) => r.frecency > 0)
    .sort((a, b) => b.frecency - a.frecency || (a.personId < b.personId ? -1 : 1));
  const out = new Map<string, Rating>(relationships.map((r) => [r.personId, 1]));
  contacted.forEach((r, rank) => out.set(r.personId, (5 - Math.floor((4 * rank) / contacted.length)) as Rating));
  return out;
}

export interface TierInput {
  id: string;
  tier: Rating;
  /** Primary area first (a relationship type or a group id). */
  categories: string[];
  label: string;
  radius: number;
}

/** A row caption: text baseline at (x, y), left-aligned above the row. */
export interface TierRow {
  x: number;
  y: number;
  label: string;
}

const ROW_GAP = 30;
const COL_GAP = 14;
/** People per line before a tier wraps onto another line. */
const MAX_PER_LINE = 10;
const FIRST_ROW = 110;
/**
 * Longest set link in tiers: the widest in-row spacing, so neighbours in a row join up. Rows are
 * always laid out further apart than this, so rows never do.
 */
export const TIER_SET_LINK = 2 * MAX_NODE_RADIUS + COL_GAP + 1;

/**
 * The list arrangement: you at the top, one row per tier (highest first),
 * each row grouped by relationship type (same order as the ring sectors)
 * and then by name, centred under you. Long rows wrap.
 */
export function tierLayout(nodes: TierInput[], labels: Record<Rating, string>): { positions: Map<string, Point>; rows: TierRow[] } {
  const positions = new Map<string, Point>();
  const rows: TierRow[] = [];
  const typeRank = (c: string | undefined) => {
    const i = c === undefined ? -1 : (SECTOR_ORDER as string[]).indexOf(c);
    return i < 0 ? SECTOR_ORDER.length : i;
  };
  let y = FIRST_ROW;
  for (const tier of [5, 4, 3, 2, 1] as Rating[]) {
    const members = nodes
      .filter((n) => n.tier === tier)
      .sort(
        (a, b) =>
          typeRank(a.categories[0]) - typeRank(b.categories[0]) ||
          (a.categories[0] ?? '').localeCompare(b.categories[0] ?? '') ||
          a.label.localeCompare(b.label) ||
          (a.id < b.id ? -1 : 1),
      );
    if (!members.length) continue;
    const maxR = Math.max(...members.map((m) => m.radius));
    const step = 2 * maxR + COL_GAP;
    // Rows are always further apart than the longest type-area link, so areas never join rows.
    const lineHeight = Math.max(step + ROW_GAP, TIER_SET_LINK + 1);
    const widest = Math.min(members.length, MAX_PER_LINE);
    rows.push({ x: -((widest - 1) * step) / 2 - maxR, y: y - maxR - 8, label: labels[tier] });
    for (let start = 0; start < members.length; start += MAX_PER_LINE) {
      const line = members.slice(start, start + MAX_PER_LINE);
      const x0 = -((line.length - 1) * step) / 2;
      line.forEach((m, k) => positions.set(m.id, { x: x0 + k * step, y }));
      y += lineHeight;
    }
  }
  return { positions, rows };
}

/**
 * Minimum spanning tree over points (Prim, O(n^2)), as pairs of indices into
 * `idx`, skipping edges longer than `maxLength` so a scattered group shows
 * as separate islands rather than one long bar. Runs on the UI thread each
 * frame to draw relationship-type sets.
 */
export function spanningEdges(xy: number[], idx: number[], maxLength: number): number[] {
  'worklet';
  const n = idx.length;
  const out: number[] = [];
  if (n < 2) return out;
  const inTree: boolean[] = new Array(n).fill(false);
  const best: number[] = new Array(n).fill(Infinity);
  const from: number[] = new Array(n).fill(-1);
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let k = 0; k < n; k++) if (!inTree[k] && (u < 0 || best[k]! < best[u]!)) u = k;
    inTree[u] = true;
    if (from[u]! >= 0 && best[u]! <= maxLength) out.push(idx[from[u]!]!, idx[u]!);
    const ux = xy[2 * idx[u]!]!;
    const uy = xy[2 * idx[u]! + 1]!;
    for (let k = 0; k < n; k++) {
      if (inTree[k]) continue;
      const d = Math.hypot(xy[2 * idx[k]!]! - ux, xy[2 * idx[k]! + 1]! - uy);
      if (d < best[k]!) {
        best[k] = d;
        from[k] = u;
      }
    }
  }
  return out;
}

/**
 * Short fingerprint of everything that shapes the ring layout (ties, each
 * person's ring, size and types), stored with saved positions so a layout
 * saved under different settings relaxes into the new ones. FNV-1a, hex.
 */
export function layoutSignature(parts: string[]): string {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c; // separator, so ["ab", "c"] differs from ["a", "bc"]
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
