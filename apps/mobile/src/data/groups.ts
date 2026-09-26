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

/**
 * The records that make a group a relationship of its own: a group entry in the log (kind
 * 'group', same id as its membership record) and its type. Everything else (importance, rhythm,
 * ideal, quality, status) starts at the defaults, as for a new person.
 */
export function groupEntityEvents(group: Pick<PersonGroup, 'id' | 'name'>, now: number, newId: () => string): StoredEvent[] {
  const ev = newId();
  return [
    { id: newId(), ts: now, kind: 'person', body: { id: group.id, displayName: group.name.trim(), kind: 'group' } },
    { id: ev, ts: now, kind: 'relationship', body: { id: ev, personId: group.id, ts: now, field: 'category', value: 'other' } },
  ];
}

/** A rename of the group's entry (its membership record is saved separately). */
export function groupRenameEvent(groupId: string, name: string, now: number, newId: () => string): StoredEvent {
  return { id: newId(), ts: now, kind: 'person', body: { id: groupId, displayName: name.trim(), kind: 'group' } };
}

/** Groups whose members should now include people named at a catch-up with them. */
export function joinFromCatchUp(groups: PersonGroup[], participants: string[]): PersonGroup[] {
  const present = new Set(participants);
  const groupIdsHere = groups.filter((g) => present.has(g.id));
  return groupIdsHere.flatMap((g) => {
    const newcomers = participants.filter((p) => p !== g.id && !groups.some((x) => x.id === p) && !g.members.includes(p));
    return newcomers.length ? [{ ...g, members: [...g.members, ...newcomers] }] : [];
  });
}
