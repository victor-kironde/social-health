import type {
  CallRecord,
  EventLog,
  Interaction,
  LoggingActivity,
  Pause,
  Person,
  RelationshipEvent,
  SupportReport,
  Timestamp,
} from '@sg/score-engine';
import type { PersonGroup } from './groups';

/**
 * Everything the app records is one row in the append-only `event` table.
 * The engine's EventLog is rebuilt by folding these rows in (ts, id) order.
 */
export type StoredEvent =
  | { id: string; ts: Timestamp; kind: 'person'; body: Person }
  | { id: string; ts: Timestamp; kind: 'relationship'; body: RelationshipEvent }
  | { id: string; ts: Timestamp; kind: 'interaction'; body: Interaction }
  | { id: string; ts: Timestamp; kind: 'support'; body: SupportReport }
  | { id: string; ts: Timestamp; kind: 'logging'; body: LoggingActivity }
  | { id: string; ts: Timestamp; kind: 'pause'; body: Pause }
  | { id: string; ts: Timestamp; kind: 'call'; body: CallRecord }
  /** A passive data source being connected (e.g. the call log). Disconnecting deletes it. */
  | { id: string; ts: Timestamp; kind: 'source'; body: { source: 'call_log' } }
  /** One of your own groups (current state; see groups.ts). Not part of the scoring log. */
  | { id: string; ts: Timestamp; kind: 'group'; body: PersonGroup };

export interface EventRow {
  id: string;
  kind: string;
  ts: number;
  body: string;
}

export const emptyLog = (): EventLog => ({
  people: [],
  relationshipEvents: [],
  interactions: [],
  supportReports: [],
  loggingActivity: [],
  pauses: [],
});

export function toRow(e: StoredEvent): EventRow {
  return { id: e.id, kind: e.kind, ts: e.ts, body: JSON.stringify(e.body) };
}

/** Parses a row; returns null for unknown kinds so newer data does not crash older code. */
export function fromRow(row: EventRow): StoredEvent | null {
  const body = JSON.parse(row.body);
  switch (row.kind) {
    case 'person':
    case 'relationship':
    case 'interaction':
    case 'support':
    case 'logging':
    case 'pause':
    case 'call':
    case 'source':
    case 'group':
      return { id: row.id, ts: row.ts, kind: row.kind, body } as StoredEvent;
    default:
      return null;
  }
}

/** Returns a new log with `events` appended. Does not mutate `log`. */
export function appendToLog(log: EventLog, events: StoredEvent[]): EventLog {
  const next: EventLog = {
    people: [...log.people],
    relationshipEvents: [...log.relationshipEvents],
    interactions: [...log.interactions],
    supportReports: [...log.supportReports],
    loggingActivity: [...log.loggingActivity],
    pauses: [...log.pauses],
    ...(log.calls ? { calls: [...log.calls] } : {}),
  };
  for (const e of events) {
    switch (e.kind) {
      case 'person': {
        // Re-recording a person replaces their profile (e.g. a rename).
        const i = next.people.findIndex((p) => p.id === e.body.id);
        if (i >= 0) next.people[i] = e.body;
        else next.people.push(e.body);
        break;
      }
      case 'relationship':
        next.relationshipEvents.push(e.body);
        break;
      case 'interaction':
        next.interactions.push(e.body);
        break;
      case 'support':
        next.supportReports.push(e.body);
        break;
      case 'logging':
        next.loggingActivity.push(e.body);
        break;
      case 'pause':
        next.pauses.push(e.body);
        break;
      // Calls exist only while the call log is connected: disconnecting deletes every call
      // and source event (see db.disconnectCallLog), so the fold does not depend on order.
      case 'call':
        (next.calls ??= []).push(e.body);
        break;
      case 'source':
        if (e.body.source === 'call_log') next.calls ??= [];
        break;
    }
  }
  return next;
}

export function logFromRows(rows: EventRow[]): EventLog {
  const events = [...rows]
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(fromRow)
    .filter((e): e is StoredEvent => e !== null);
  return appendToLog(emptyLog(), events);
}
