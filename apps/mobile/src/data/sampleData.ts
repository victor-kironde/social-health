import type { EventLog } from '@sg/score-engine';
import type { StoredEvent } from './codec';

/**
 * A synthetic scenario as stored events, shifted in time so its "today" is `now` (for trying the
 * app out or testing it on an empty install). Ids are prefixed so they can never clash.
 */
export function scenarioToEvents(log: EventLog, asOf: number, now: number): StoredEvent[] {
  const shift = now - asOf;
  const at = (ts: number) => ts + shift;
  const pid = (id: string) => `sample-${id}`;
  const out: StoredEvent[] = [];
  const firstSeen = new Map<string, number>();
  for (const e of log.relationshipEvents) firstSeen.set(e.personId, Math.min(firstSeen.get(e.personId) ?? Infinity, e.ts));
  for (const p of log.people) {
    const ts = at(firstSeen.get(p.id) ?? asOf);
    const name = p.displayName.charAt(0).toUpperCase() + p.displayName.slice(1);
    out.push({ id: pid(`person-${p.id}`), ts, kind: 'person', body: { ...p, id: pid(p.id), displayName: name } });
  }
  for (const e of log.relationshipEvents) {
    const body = { ...e, id: pid(e.id), personId: pid(e.personId), ts: at(e.ts) };
    out.push({ id: body.id, ts: body.ts, kind: 'relationship', body });
  }
  for (const x of log.interactions) {
    const body = { ...x, id: pid(x.id), ts: at(x.ts), loggedAt: at(x.loggedAt), participants: x.participants.map(pid) };
    out.push({ id: body.id, ts: body.ts, kind: 'interaction', body });
  }
  for (const s of log.supportReports) {
    const body = { ...s, id: pid(s.id), personId: pid(s.personId), ts: at(s.ts) };
    out.push({ id: body.id, ts: body.ts, kind: 'support', body });
  }
  log.pauses.forEach((p, i) => {
    out.push({ id: pid(`pause-${i}`), ts: at(p.from), kind: 'pause', body: { from: at(p.from), to: p.to === null ? null : at(p.to) } });
  });
  log.loggingActivity.forEach((l, i) => {
    out.push({ id: pid(`logging-${i}`), ts: at(l.ts), kind: 'logging', body: { ...l, ts: at(l.ts) } });
  });
  if (log.calls) {
    out.push({ id: pid('source-calls'), ts: at(asOf - 365 * 86_400_000), kind: 'source', body: { source: 'call_log' } });
    for (const c of log.calls) {
      const body = { ...c, id: pid(c.id), personId: pid(c.personId), ts: at(c.ts) };
      out.push({ id: body.id, ts: body.ts, kind: 'call', body });
    }
  }
  return out;
}
