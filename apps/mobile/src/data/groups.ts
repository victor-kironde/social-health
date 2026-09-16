import type { StoredEvent } from './codec';

/**
 * Your own groups of people (a book club, uni friends, the five-a-side team), separate from
 * relationship types. Each group is one current record: editing replaces it and deleting removes
 * it from storage entirely, so a renamed or deleted group leaves nothing behind.
 */
export interface PersonGroup {
  id: string;
  name: string;
  /** Person ids, in no particular order. */
  members: string[];
  createdAt: number;
}

export const MAX_GROUP_NAME = 40;

export function validateGroup(name: string, existing: PersonGroup[], selfId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the group a name.';
  if (n.length > MAX_GROUP_NAME) return `Keep the name under ${MAX_GROUP_NAME} characters.`;
  if (existing.some((g) => g.id !== selfId && g.name.toLowerCase() === n.toLowerCase())) return 'You already have a group with that name.';
  return null;
}

/** The stored row for a group's current state. */
export function groupEvent(group: PersonGroup, now: number): StoredEvent {
  return {
    id: `group:${group.id}`,
    ts: now,
    kind: 'group',
    body: { ...group, name: group.name.trim(), members: [...new Set(group.members)].sort() },
  };
}

/** Current groups from stored events (the latest record per group), sorted by name. */
export function groupsFromEvents(events: StoredEvent[]): PersonGroup[] {
  const latest = new Map<string, { ts: number; group: PersonGroup }>();
  for (const e of events) {
    if (e.kind !== 'group') continue;
    const prev = latest.get(e.body.id);
    if (!prev || e.ts >= prev.ts) latest.set(e.body.id, { ts: e.ts, group: e.body });
  }
  return [...latest.values()].map((x) => x.group).sort((a, b) => a.name.localeCompare(b.name));
}

/** Group ids each person belongs to. */
export function membership(groups: PersonGroup[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of groups) for (const id of g.members) out.set(id, [...(out.get(id) ?? []), g.id]);
  return out;
}
