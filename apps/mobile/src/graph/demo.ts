import type { Category, Rating, RelationshipContribution } from '@sg/score-engine';

const CATEGORIES: Category[] = ['family', 'friend', 'work', 'neighbour', 'community'];

/** Synthetic relationships for the on-device graph stress test. Never stored. */
export function demoNetwork(n: number): { relationships: RelationshipContribution[]; names: Map<string, string> } {
  const relationships: RelationshipContribution[] = [];
  const names = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const id = `demo-${String(i).padStart(3, '0')}`;
    names.set(id, `Person ${i + 1}`);
    relationships.push({
      personId: id,
      category: CATEGORIES[i % CATEGORIES.length]!,
      importance: (((i * 7) % 5) + 1) as Rating,
      quality: i % 4 === 0 ? null : ((((i * 3) % 5) + 1) as Rating),
      rhythm: 'monthly',
      state: 'active',
      included: true,
      expectedIntervalDays: 30,
      level: (i % 10) / 10,
      onRhythm: i % 3 === 0 ? 0 : 1,
      lastContactAgeDays: i % 3 === 0 ? 90 : 5,
    });
  }
  return { relationships, names };
}
