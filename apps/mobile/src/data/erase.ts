import { MODEL_VERSION } from '@sg/score-engine';
import type { StoredEvent } from './codec';
import { normalisePlan } from './plans';

/**
 * Right to erasure: everything recorded about a person, removed for real.
 * The event log is otherwise append-only, but erasure takes precedence:
 *  - their profile, relationship changes and support reports are deleted;
 *  - shared contacts are rewritten without them, and contacts that were
 *    only with them are deleted.
 * Returns which events to delete and which to replace (same id, new body).
 */
export function eraseFromLog(events: StoredEvent[], personId: string): { remove: string[]; replace: StoredEvent[] } {
  const remove: string[] = [];
  const replace: StoredEvent[] = [];
  for (const e of events) {
    switch (e.kind) {
      case 'person':
        if (e.body.id === personId) remove.push(e.id);
        break;
      case 'relationship':
      case 'support':
      case 'call':
        if (e.body.personId === personId) remove.push(e.id);
        break;
      case 'interaction': {
        if (!e.body.participants.includes(personId)) break;
        const others = e.body.participants.filter((p) => p !== personId);
        if (others.length === 0) remove.push(e.id);
        else replace.push({ ...e, body: { ...e.body, participants: others } });
        break;
      }
      case 'group':
        // Groups keep going without them.
        if (e.body.members.includes(personId)) {
          replace.push({ ...e, body: { ...e.body, members: e.body.members.filter((m) => m !== personId) } });
        }
        break;
      case 'plan': {
        // Plans go on without them; one with nobody left goes. Past catch-ups were handled above.
        const plan = normalisePlan(e.body);
        if (!plan.withIds.includes(personId)) break;
        const others = plan.withIds.filter((id) => id !== personId);
        if (others.length === 0) remove.push(e.id);
        else replace.push({ ...e, body: { ...plan, withIds: others } });
        break;
      }
      default:
        break;
    }
  }
  return { remove, replace };
}

export const DATA_FORMAT = 'social-graph-data';

/** The plaintext inside an export: the full event log plus enough context to read it later. */
export function buildExportPayload(events: StoredEvent[], schemaVersion: number, now: number): string {
  return JSON.stringify(
    {
      format: DATA_FORMAT,
      version: 1,
      exportedAt: new Date(now).toISOString(),
      schemaVersion,
      modelVersion: MODEL_VERSION,
      note: 'Every record you have made in Social Health, as an append-only event log.',
      events,
    },
    null,
    1,
  );
}
