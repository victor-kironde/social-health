/**
 * Properties the Social Health Score must satisfy for any well-formed input.
 * These were written before the formula was chosen (see git history) and act
 * as its specification: a candidate formula that fails one is rejected rather
 * than the property being weakened.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ARB_AS_OF, arbEventLog } from '@sg/synth';
import {
  DAY,
  DEFAULT_CONFIG,
  computeScore,
  type EventLog,
  type Interaction,
  type InteractionType,
  type Rating,
  type Rhythm,
} from '../src';

const EPS = 1e-9;
const RUNS = { numRuns: 300 };
const score = (log: EventLog, asOf = ARB_AS_OF) => computeScore(log, DEFAULT_CONFIG, asOf);

const arbType = fc.constantFrom<InteractionType>('in_person', 'video', 'voice', 'message');

function withInteraction(log: EventLog, x: Omit<Interaction, 'id' | 'source'>): EventLog {
  return { ...log, interactions: [...log.interactions, { id: `added-${log.interactions.length}`, source: 'manual', ...x }] };
}

describe('score properties', () => {
  it('P1 bounded: total in [0, 100], components and confidence in [0, 1]', () => {
    fc.assert(
      fc.property(arbEventLog(), (log) => {
        const r = score(log);
        expect(r.total).toBeGreaterThanOrEqual(0);
        expect(r.total).toBeLessThanOrEqual(100);
        for (const c of Object.values(r.components)) {
          if (c !== null) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1);
          }
        }
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }),
      RUNS,
    );
  });

  it('P2 deterministic: same input gives the same result', () => {
    fc.assert(
      fc.property(arbEventLog(), (log) => {
        expect(score(structuredClone(log))).toEqual(score(log));
      }),
      RUNS,
    );
  });

  it('P3 monotone in contact: adding an interaction never lowers the score', () => {
    fc.assert(
      fc.property(
        arbEventLog(),
        fc.integer({ min: 0, max: 400 }),
        arbType,
        fc.nat(),
        (log, daysAgo, type, pick) => {
          const person = log.people[pick % log.people.length]!.id;
          const ts = ARB_AS_OF - daysAgo * DAY;
          const after = withInteraction(log, { ts, loggedAt: ts, type, participants: [person] });
          expect(score(after).total).toBeGreaterThanOrEqual(score(log).total - EPS);
        },
      ),
      RUNS,
    );
  });

  it('P4 no inflation over time: with no new data, the score never rises', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 1, max: 365 }), (log, laterDays) => {
        const now = score(log, ARB_AS_OF).total;
        const later = score(log, ARB_AS_OF + laterDays * DAY).total;
        expect(later).toBeLessThanOrEqual(now + EPS);
      }),
      RUNS,
    );
  });

  it('P5 diminishing returns: each extra identical interaction with one person adds no more than the last', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 0, max: 60 }), arbType, fc.nat(), (log, daysAgo, type, pick) => {
        const person = log.people[pick % log.people.length]!.id;
        const ts = ARB_AS_OF - daysAgo * DAY;
        let current = log;
        let prevTotal = score(current).total;
        let prevGain = Infinity;
        for (let k = 0; k < 4; k++) {
          current = withInteraction(current, { ts, loggedAt: ts, type, participants: [person] });
          const total = score(current).total;
          const gain = total - prevTotal;
          expect(gain).toBeLessThanOrEqual(prevGain + EPS);
          prevGain = gain;
          prevTotal = total;
        }
      }),
      RUNS,
    );
  });

  it('P6 invariance: relabelling people and reordering records does not change the score', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 0, max: 2 ** 31 - 1 }), (log, seed) => {
        const rename = (id: string) => `x-${id.split('').reverse().join('')}`;
        const shuffle = <T>(xs: T[]): T[] => {
          const out = [...xs];
          let s = seed || 1;
          for (let i = out.length - 1; i > 0; i--) {
            s = (s * 1103515245 + 12345) % 2 ** 31;
            const j = s % (i + 1);
            [out[i], out[j]] = [out[j]!, out[i]!];
          }
          return out;
        };
        const relabelled: EventLog = {
          people: shuffle(log.people.map((p) => ({ ...p, id: rename(p.id) }))),
          relationshipEvents: shuffle(log.relationshipEvents.map((e) => ({ ...e, personId: rename(e.personId) }))),
          interactions: shuffle(
            log.interactions.map((x) => ({ ...x, participants: shuffle(x.participants.map(rename)) })),
          ),
          supportReports: shuffle(log.supportReports.map((s) => ({ ...s, personId: rename(s.personId) }))),
          loggingActivity: shuffle(log.loggingActivity),
          pauses: shuffle(log.pauses),
          ...(log.calls ? { calls: shuffle(log.calls.map((c) => ({ ...c, personId: rename(c.personId) }))) } : {}),
        };
        const a = score(log);
        const b = score(relabelled);
        expect(b.total).toBeCloseTo(a.total, 9);
        expect(b.confidence).toBeCloseTo(a.confidence, 9);
      }),
      RUNS,
    );
  });

  it('P7 moving contact from a well-covered person to a neglected one of equal importance raises coverage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Rhythm>('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'),
        fc.constantFrom<Rating>(4, 5),
        arbType,
        (rhythm, importance, type) => {
          const interval = DEFAULT_CONFIG.rhythmDays[rhythm as Exclude<Rhythm, 'occasional'>];
          const t = (daysAgo: number) => ARB_AS_OF - daysAgo * DAY;
          // `a` was seen today and yesterday; `b` not for 3 intervals. Move yesterday's contact to `b`.
          const base = (yesterdayWith: 'a' | 'b'): EventLog => ({
            people: [
              { id: 'a', displayName: 'a' },
              { id: 'b', displayName: 'b' },
            ],
            relationshipEvents: ['a', 'b'].flatMap((personId, i) => [
              { id: `c${i}`, personId, ts: t(500), field: 'category' as const, value: 'friend' as const },
              { id: `i${i}`, personId, ts: t(500), field: 'importance' as const, value: importance },
              { id: `r${i}`, personId, ts: t(500), field: 'rhythm' as const, value: rhythm },
            ]),
            interactions: [
              { id: 'x1', ts: t(0), loggedAt: t(0), type, participants: ['a'], source: 'manual' },
              { id: 'x2', ts: t(1), loggedAt: t(1), type, participants: [yesterdayWith], source: 'manual' },
              { id: 'x3', ts: t(interval * 3), loggedAt: t(interval * 3), type, participants: ['b'], source: 'manual' },
            ],
            supportReports: [],
            loggingActivity: [],
            pauses: [],
          });
          const before = score(base('a')).components.coverage!;
          const after = score(base('b')).components.coverage!;
          expect(after).toBeGreaterThan(before);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('P8 exclusion: contact with archived, in-memoriam or harmful relationships never raises the score', () => {
    fc.assert(
      fc.property(
        arbEventLog(),
        fc.constantFrom('archived', 'in_memoriam', 'harmful'),
        fc.integer({ min: 0, max: 60 }),
        arbType,
        (log, kind, daysAgo, type) => {
          const change =
            kind === 'harmful'
              ? ({ field: 'quality', value: 1 } as const)
              : ({ field: 'state', value: kind as 'archived' | 'in_memoriam' } as const);
          const withExcluded: EventLog = {
            ...log,
            people: [...log.people, { id: 'z', displayName: 'z' }],
            relationshipEvents: [
              ...log.relationshipEvents,
              { id: 'z-cat', personId: 'z', ts: ARB_AS_OF - 500 * DAY, field: 'category', value: 'friend' },
              { id: 'z-excl', personId: 'z', ts: ARB_AS_OF - 500 * DAY, ...change },
            ],
          };
          const ts = ARB_AS_OF - daysAgo * DAY;
          const after = withInteraction(withExcluded, { ts, loggedAt: ts, type, participants: ['z'] });
          expect(score(after).total).toBeLessThanOrEqual(score(withExcluded).total + EPS);
        },
      ),
      RUNS,
    );
  });

  it('P9 pauses are protective: adding a global pause never lowers the score', () => {
    fc.assert(
      fc.property(
        arbEventLog(),
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 1, max: 90 }),
        (log, fromDaysAgo, lengthDays) => {
          const from = ARB_AS_OF - fromDaysAgo * DAY;
          const paused = { ...log, pauses: [...log.pauses, { from, to: Math.min(ARB_AS_OF, from + lengthDays * DAY) }] };
          expect(score(paused).total).toBeGreaterThanOrEqual(score(log).total - EPS);
        },
      ),
      RUNS,
    );
  });

  it('P10 empty network scores 0 with no confidence', () => {
    const empty: EventLog = {
      people: [],
      relationshipEvents: [],
      interactions: [],
      supportReports: [],
      loggingActivity: [],
      pauses: [],
    };
    const r = score(empty);
    expect(r.total).toBe(0);
    expect(r.confidence).toBe(0);
  });
});

describe('call metadata and frecency (model v0.2)', () => {
  const withCall = (log: EventLog, c: Omit<NonNullable<EventLog['calls']>[number], 'id'>): EventLog => ({
    ...log,
    calls: [...(log.calls ?? []), { id: `added-call-${(log.calls ?? []).length}`, ...c }],
  });
  const arbDirection = fc.constantFrom<'incoming' | 'outgoing'>('incoming', 'outgoing');

  it('P11 adding an answered call never lowers the score (source connected)', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 3600 }), arbDirection, fc.nat(), (log, daysAgo, durationSec, direction, pick) => {
        const connected = { ...log, calls: log.calls ?? [] };
        const personId = log.people[pick % log.people.length]!.id;
        const after = withCall(connected, { personId, ts: ARB_AS_OF - daysAgo * DAY, durationSec, direction });
        expect(score(after).total).toBeGreaterThanOrEqual(score(connected).total - EPS);
      }),
      RUNS,
    );
  });

  it('P12 a missed call changes nothing', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 0, max: 400 }), fc.nat(), (log, daysAgo, pick) => {
        const connected = { ...log, calls: log.calls ?? [] };
        const personId = log.people[pick % log.people.length]!.id;
        const after = withCall(connected, { personId, ts: ARB_AS_OF - daysAgo * DAY, durationSec: 0, direction: 'missed' });
        expect(score(after).total).toBeCloseTo(score(connected).total, 9);
      }),
      RUNS,
    );
  });

  it('P13 diminishing returns for repeated calls with one person', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.integer({ min: 0, max: 60 }), fc.nat(), (log, daysAgo, pick) => {
        const personId = log.people[pick % log.people.length]!.id;
        let current: EventLog = { ...log, calls: log.calls ?? [] };
        let prevTotal = score(current).total;
        let prevGain = Infinity;
        for (let k = 0; k < 4; k++) {
          current = withCall(current, { personId, ts: ARB_AS_OF - daysAgo * DAY, durationSec: 600, direction: 'outgoing' });
          const total = score(current).total;
          expect(total - prevTotal).toBeLessThanOrEqual(prevGain + EPS);
          prevGain = total - prevTotal;
          prevTotal = total;
        }
      }),
      RUNS,
    );
  });

  it('P14 an unconnected call source is left out; a connected empty one counts as no calls', () => {
    fc.assert(
      fc.property(arbEventLog(), (log) => {
        const { calls: _ignored, ...rest } = log;
        const unconnected = score(rest as EventLog);
        expect(unconnected.components.calls).toBeNull();
        const connected = score({ ...rest, calls: [] } as EventLog);
        if (connected.components.rhythm !== null) expect(connected.components.calls).toBe(0);
      }),
      RUNS,
    );
  });

  it('P15 frecency cannot be inflated by contacting one person a lot', () => {
    const people = Array.from({ length: 5 }, (_, i) => `f${i}`);
    const log: EventLog = {
      people: people.map((id) => ({ id, displayName: id })),
      relationshipEvents: people.flatMap((personId, i) => [
        { id: `c${i}`, personId, ts: ARB_AS_OF - 500 * DAY, field: 'category' as const, value: 'friend' as const },
        { id: `r${i}`, personId, ts: ARB_AS_OF - 500 * DAY, field: 'rhythm' as const, value: 'monthly' as const },
      ]),
      // 200 contacts, all with f0.
      interactions: Array.from({ length: 200 }, (_, k) => {
        const ts = ARB_AS_OF - (k % 30) * DAY;
        return { id: `x${k}`, ts, loggedAt: ts, type: 'in_person' as const, participants: ['f0'], source: 'manual' as const };
      }),
      supportReports: [],
      loggingActivity: [],
      pauses: [],
    };
    const r = score(log);
    expect(r.components.frecency).toBeLessThanOrEqual(1 / people.length + EPS);
  });

  it('P16 frecency ranks frequent, recent contact above one old contact', () => {
    const base: EventLog = {
      people: [
        { id: 'often', displayName: 'often' },
        { id: 'once', displayName: 'once' },
      ],
      relationshipEvents: ['often', 'once'].map((personId, i) => ({
        id: `c${i}`,
        personId,
        ts: ARB_AS_OF - 500 * DAY,
        field: 'category' as const,
        value: 'friend' as const,
      })),
      interactions: [
        ...[1, 5, 9].map((d) => ({ id: `o${d}`, ts: ARB_AS_OF - d * DAY, loggedAt: ARB_AS_OF, type: 'voice' as const, participants: ['often'], source: 'manual' as const })),
        { id: 'x', ts: ARB_AS_OF - 120 * DAY, loggedAt: ARB_AS_OF, type: 'in_person' as const, participants: ['once'], source: 'manual' as const },
      ],
      supportReports: [],
      loggingActivity: [],
      pauses: [],
    };
    const rels = score(base).relationships;
    const f = (id: string) => rels.find((r) => r.personId === id)!.frecency;
    expect(f('often')).toBeGreaterThan(f('once'));
  });
});
