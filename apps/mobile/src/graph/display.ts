import type { Category, Rating, RelationshipContribution } from '@sg/score-engine';
import type { OrderBy } from './arrange';

/** Everything the "Display & filters" panel controls. Defaults show everything. */
export interface DisplayOptions {
  arrange: 'rings' | 'tiers';
  orderBy: OrderBy;
  // Show
  sets: boolean;
  egoEdges: boolean;
  ties: boolean;
  names: boolean;
  sizeByFrequency: boolean;
  /** What colours people and their lines: relationship health, type, or group. */
  colourBy: 'health' | 'type' | 'group';
  /** What the shaded areas show: relationship types, or your own groups. */
  areas: 'types' | 'groups';
  // Filter
  /** Shown if any of their relationship types is selected. */
  categories: Category[];
  /** Only people of at least this importance (1–10). */
  minImportance: number;
  /** Only people in any of these groups of yours; empty = no group filter. */
  groups: string[];
  behindOnly: boolean;
  hideNeverContacted: boolean;
}

export const ALL_CATEGORIES: Category[] = ['family', 'friend', 'work', 'neighbour', 'community', 'other'];

export const DEFAULT_DISPLAY: DisplayOptions = {
  arrange: 'rings',
  orderBy: 'importance',
  sets: true,
  egoEdges: true,
  ties: true,
  names: true,
  sizeByFrequency: true,
  colourBy: 'health',
  areas: 'types',
  categories: ALL_CATEGORIES,
  minImportance: 1,
  groups: [],
  behindOnly: false,
  hideNeverContacted: false,
};

export const isBehind = (r: RelationshipContribution) => r.onRhythm !== null && r.onRhythm < 0.5;

/** People left after the panel's filters (filters only hide; layout and metrics use everyone). */
export function applyFilters(
  relationships: RelationshipContribution[],
  o: DisplayOptions,
  /** Group ids each person is in (for the group filter). */
  groupsOf: Map<string, string[]> = new Map(),
): RelationshipContribution[] {
  const types = new Set(o.categories);
  const wanted = new Set(o.groups);
  return relationships.filter(
    (r) =>
      (types.has(r.category) || r.alsoCategories.some((c) => types.has(c))) &&
      (wanted.size === 0 || (groupsOf.get(r.personId) ?? []).some((g) => wanted.has(g))) &&
      r.importance >= o.minImportance &&
      (!o.behindOnly || isBehind(r)) &&
      (!o.hideNeverContacted || r.lastContactAgeDays !== null),
  );
}

/** How many filters differ from showing everyone, for the panel button's badge. */
export function activeFilterCount(o: DisplayOptions): number {
  return (
    (o.categories.length < ALL_CATEGORIES.length ? 1 : 0) +
    (o.minImportance > 1 ? 1 : 0) +
    (o.behindOnly ? 1 : 0) +
    (o.hideNeverContacted ? 1 : 0) +
    (o.groups.length > 0 ? 1 : 0)
  );
}
