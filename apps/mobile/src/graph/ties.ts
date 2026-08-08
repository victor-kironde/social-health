import { DAY, type Interaction, type Timestamp } from '@sg/score-engine';

/** An inferred link between two people who appear together in logged contacts. */
export interface Tie {
  a: string;
  b: string;
  /** Decayed, group-size-discounted co-presence; ~1 = one recent contact as a pair. */
  weight: number;
  /** Shared contacts counted (undecayed). */
  count: number;
  lastTs: Timestamp;
}

export interface TieOptions {
  /** Half-life of a shared contact's contribution. */
  halfLifeDays?: number;
  /** Ties weaker than this are dropped. */
  minWeight?: number;
}

/**
 * Derives person-to-person ties from interactions with two or more of the
 * given people. Each interaction contributes 0.5^(age / halfLife) / (k - 1)
 * to every pair among its k participants: the 1/(k - 1) discount (as in
 * co-authorship networks) stops one big gathering from tying everyone
 * strongly. Nothing is asked of the user: ties come from data they already
 * logged, and only ever between people in their own graph.
 */
export function deriveTies(
  interactions: Interaction[],
  asOf: Timestamp,
  people: Set<string>,
  opts: TieOptions = {},
): Tie[] {
  const halfLife = opts.halfLifeDays ?? 90;
  const minWeight = opts.minWeight ?? 0.2;
  const acc = new Map<string, Tie>();

  for (const x of interactions) {
    if (x.ts > asOf) continue;
    const present = [...new Set(x.participants)].filter((p) => people.has(p)).sort();
    const k = present.length;
    if (k < 2) continue;
    const w = 0.5 ** ((asOf - x.ts) / DAY / halfLife) / (k - 1);
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const a = present[i]!;
        const b = present[j]!;
        const key = `${a}|${b}`;
        const t = acc.get(key);
        if (t) {
          t.weight += w;
          t.count += 1;
          t.lastTs = Math.max(t.lastTs, x.ts);
        } else {
          acc.set(key, { a, b, weight: w, count: 1, lastTs: x.ts });
        }
      }
    }
  }

  return [...acc.values()]
    .filter((t) => t.weight >= minWeight)
    .sort((x, y) => y.weight - x.weight || (x.a + x.b < y.a + y.b ? -1 : 1));
}

/** Order-independent signature of which pairs are tied (not their weights). */
export function tieSignature(ties: Tie[]): string {
  return ties
    .map((t) => `${t.a}|${t.b}`)
    .sort()
    .join(',');
}
