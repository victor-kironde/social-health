import type { EventLog } from '@sg/score-engine';

/**
 * The log as if only these people were in your network, for scoring a filtered view: their
 * relationship history, support reports and calls, and catch-ups trimmed to the people kept (a
 * group catch-up still counts for whoever of them was there). Pauses and logging activity are
 * about you, so they stay.
 */
export function restrictLog(log: EventLog, ids: Set<string>): EventLog {
  return {
    ...log,
    people: log.people.filter((p) => ids.has(p.id)),
    relationshipEvents: log.relationshipEvents.filter((e) => ids.has(e.personId)),
    supportReports: log.supportReports.filter((s) => ids.has(s.personId)),
    interactions: log.interactions
      .map((x) => (x.participants.every((p) => ids.has(p)) ? x : { ...x, participants: x.participants.filter((p) => ids.has(p)) }))
      .filter((x) => x.participants.length > 0),
    ...(log.calls ? { calls: log.calls.filter((c) => ids.has(c.personId)) } : {}),
  };
}
