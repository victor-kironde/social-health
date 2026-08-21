import type { CallRecord, Person } from '@sg/score-engine';
import { nameKey } from './contactsImport';
import type { StoredEvent } from './codec';

/** One call's metadata as read from the phone (see modules/call-log). No number. */
export interface PhoneCall {
  name: string | null;
  date: number;
  durationSec: number;
  type: 'incoming' | 'outgoing' | 'missed' | 'other';
}

export interface CallMatch {
  events: StoredEvent[];
  /** Calls matched to someone in the network. */
  matched: number;
  /** People with at least one matched call. */
  people: number;
  /** Calls with no cached name, someone not in the network, or an ambiguous name. */
  skipped: number;
}

/**
 * Matches calls to people by the name Android cached for the caller,
 * compared case- and spacing-insensitively. Only unambiguous matches are
 * kept: if two people share a name, their calls are skipped rather than
 * guessed. Ids are deterministic (time, duration, direction, person) so
 * importing the same calls twice never duplicates them.
 */
export function matchCalls(calls: PhoneCall[], people: Person[], existingIds: Set<string>): CallMatch {
  const byKey = new Map<string, string | null>(); // key -> personId, or null when ambiguous
  for (const p of people) {
    const k = nameKey(p.displayName);
    byKey.set(k, byKey.has(k) ? null : p.id);
  }
  const events: StoredEvent[] = [];
  const touched = new Set<string>();
  let skipped = 0;
  for (const c of calls) {
    if (c.type === 'other' || !c.name) {
      skipped++;
      continue;
    }
    const personId = byKey.get(nameKey(c.name));
    if (!personId) {
      skipped++;
      continue;
    }
    const id = `call:${c.date}:${c.durationSec}:${c.type}:${personId}`;
    touched.add(personId);
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    const body: CallRecord = { id, personId, ts: c.date, durationSec: c.durationSec, direction: c.type };
    events.push({ id, ts: c.date, kind: 'call', body });
  }
  return { events, matched: events.length, people: touched.size, skipped };
}
