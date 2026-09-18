import { DAY, type Category, type Rating, type RelationshipContribution } from '@sg/score-engine';
import type { Tie } from './ties';

const CATEGORIES: Category[] = ['family', 'friend', 'work', 'neighbour', 'community'];

/** Synthetic relationships for the on-device graph stress test. Never stored. */
export function demoNetwork(n: number): { relationships: RelationshipContribution[]; names: Map<string, string>; ties: Tie[] } {
  const relationships: RelationshipContribution[] = [];
  const names = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const id = `demo-${String(i).padStart(3, '0')}`;
    names.set(id, `Person ${i + 1}`);
    relationships.push({
      personId: id,
      category: CATEGORIES[i % CATEGORIES.length]!,
      // Every seventh person also has a second type, so the set intersections show up.
      alsoCategories: i % 7 === 0 ? [CATEGORIES[(i + 2) % CATEGORIES.length]!] : [],
      importance: (((i * 7) % 5) + 1) as Rating,
      quality: i % 4 === 0 ? null : ((((i * 3) % 5) + 1) as Rating),
      rhythm: 'monthly',
      state: 'active',
      ideal: 10,
      included: true,
      expectedIntervalDays: 30,
      level: (i % 10) / 10,
      onRhythm: i % 3 === 0 ? 0 : 1,
      lastContactAgeDays: i % 3 === 0 ? 90 : i % 5 === 0 ? null : (i * 13) % 40,
      callLevel: null,
      // Spread of contact frequency so node sizes vary.
      frecency: i % 3 === 0 ? 0.1 : i % 5 === 0 ? 0 : 0.5 + ((i * 37) % 11) / 2,
    });
  }
  return { relationships, names, ties: demoTies(relationships) };
}

/**
 * Friend groups for the stress test: within each category, consecutive
 * people form groups of four who are all tied, plus a few weaker ties
 * between neighbouring groups.
 */
function demoTies(relationships: RelationshipContribution[]): Tie[] {
  const now = Date.now();
  const ties: Tie[] = [];
  const tie = (a: string, b: string, weight: number) =>
    ties.push({ a: a < b ? a : b, b: a < b ? b : a, weight, count: Math.round(weight * 2), lastTs: now - 5 * DAY });
  for (const category of CATEGORIES) {
    const ids = relationships.filter((r) => r.category === category).map((r) => r.personId);
    for (let g = 0; g < ids.length; g += 4) {
      const group = ids.slice(g, g + 4);
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) tie(group[i]!, group[j]!, 1.5);
      if (g + 4 < ids.length) tie(ids[g]!, ids[g + 4]!, 0.4);
    }
  }
  return ties;
}
