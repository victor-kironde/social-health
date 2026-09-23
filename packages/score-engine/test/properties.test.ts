/**
 * Properties the Social Health Score must satisfy for any well-formed input.
 *
 * Model v0.3 added ideals (how close each relationship is hoped to be). Properties about
 * the shape of the standard model (P3 more contact never hurts, P4 no inflation over time,
 * P5 and P13 diminishing returns, P9 pauses protect, P11 calls never hurt, P14 an empty
 * connected call log counts as no calls) hold for the default ideal of 10 and are tested on
 * networks without other ideals: with a lower ideal, drifting towards it raises the score and
 * contact beyond it lowers it, by design (P19, P20). The others are tested with random ideals.
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
  fitToIdeal,
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
      fc.property(arbEventLog({ ideals: true }), (log) => {
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
      fc.property(arbEventLog({ ideals: true }), (log) => {
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
      fc.property(arbEventLog({ ideals: true }), fc.integer({ min: 0, max: 2 ** 31 - 1 }), (log, seed) => {
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

  it('P7 moving contact from a well-kept relationship to a neglected one of equal importance raises the rhythm part', () => {
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
          const before = score(base('a')).components.rhythm!;
          const after = score(base('b')).components.rhythm!;
          expect(after).toBeGreaterThan(before);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('P8 exclusion: contact with archived, in-memoriam or harmful relationships never raises the score', () => {
    fc.assert(
      fc.property(
        arbEventLog({ ideals: true }),
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
      fc.property(arbEventLog({ ideals: true }), fc.integer({ min: 0, max: 400 }), fc.nat(), (log, daysAgo, pick) => {
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

describe('ideals: how close each relationship is hoped to be (model v0.3)', () => {
  /** The log with an ideal set for person `id`, after everything else about them. */
  const withIdeal = (log: EventLog, id: string, ideal: number | null): EventLog => ({
    ...log,
    relationshipEvents: [
      ...log.relationshipEvents,
      { id: `ideal-${id}`, personId: id, ts: ARB_AS_OF - 450 * DAY, field: 'ideal', value: ideal },
    ],
  });

  it('P17 the default ideal is the standard model: setting every ideal to 10 changes nothing', () => {
    fc.assert(
      fc.property(arbEventLog(), (log) => {
        let explicit = log;
        for (const p of log.people) explicit = withIdeal(explicit, p.id, 10);
        expect(score(explicit).total).toBeCloseTo(score(log).total, 9);
      }),
      RUNS,
    );
  });

  it('P18 "don\'t mind": a relationship with no ideal never changes the score, whatever happens in it', () => {
    fc.assert(
      fc.property(arbEventLog({ ideals: true }), fc.integer({ min: 0, max: 60 }), arbType, (log, daysAgo, type) => {
        const base: EventLog = withIdeal(
          {
            ...log,
            people: [...log.people, { id: 'z', displayName: 'z' }],
            relationshipEvents: [
              ...log.relationshipEvents,
              { id: 'z-cat', personId: 'z', ts: ARB_AS_OF - 500 * DAY, field: 'category', value: 'friend' },
              { id: 'z-imp', personId: 'z', ts: ARB_AS_OF - 500 * DAY, field: 'importance', value: 5 },
            ],
          },
          'z',
          null,
        );
        const ts = ARB_AS_OF - daysAgo * DAY;
        const after = withInteraction(base, { ts, loggedAt: ts, type, participants: ['z'] });
        expect(score(after).total).toBeCloseTo(score(base).total, 9);
        // Removing them entirely gives the same score too.
        expect(score(base).total).toBeCloseTo(score(log).total, 9);
      }),
      RUNS,
    );
  });

  it('P19 an ideal is a target: fit is 1 at it and never rises moving away from it, either way', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (ideal, a, b) => {
          const t = (ideal - 1) / 9;
          expect(fitToIdeal(t, ideal)).toBeCloseTo(1, 12);
          // b at least as far from the target as a, on the same side: fit(b) <= fit(a).
          if ((a - t) * (b - t) >= 0 && Math.abs(b - t) >= Math.abs(a - t)) {
            expect(fitToIdeal(b, ideal)).toBeLessThanOrEqual(fitToIdeal(a, ideal) + EPS);
          }
          expect(fitToIdeal(a, 10)).toBeCloseTo(a, 12); // default ideal: the raw value
          expect(fitToIdeal(a, ideal)).toBeGreaterThanOrEqual(0);
          expect(fitToIdeal(a, ideal)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P20 for a relationship hoped to be distant, a lot of contact eventually lowers the score', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), arbType, (ideal, type) => {
        let log: EventLog = {
          people: [{ id: 'ex', displayName: 'ex' }],
          relationshipEvents: [
            { id: 'c', personId: 'ex', ts: ARB_AS_OF - 400 * DAY, field: 'category', value: 'other' },
            { id: 'r', personId: 'ex', ts: ARB_AS_OF - 400 * DAY, field: 'rhythm', value: 'monthly' },
            { id: 'i', personId: 'ex', ts: ARB_AS_OF - 400 * DAY, field: 'ideal', value: ideal },
          ],
          interactions: [],
          supportReports: [],
          loggingActivity: [],
          pauses: [],
        };
        const sparse = score(withInteraction(log, { ts: ARB_AS_OF - 20 * DAY, loggedAt: ARB_AS_OF - 20 * DAY, type, participants: ['ex'] })).total;
        for (let d = 0; d < 60; d += 2) log = withInteraction(log, { ts: ARB_AS_OF - d * DAY, loggedAt: ARB_AS_OF - d * DAY, type: 'in_person', participants: ['ex'] });
        expect(score(log).total).toBeLessThan(sparse);
      }),
      { numRuns: 40 },
    );
  });
});

describe('custom catch-up frequency: "at least N times a period" (model v0.3)', () => {
  /** Swap every preset rhythm event for the equivalent custom frequency. */
  const asCustom = (log: EventLog): EventLog => ({
    ...log,
    relationshipEvents: log.relationshipEvents.map((e) => {
      if (e.field !== 'rhythm') return e;
      const map: Record<string, { times: number; per: 'week' | 'month' | 'year' } | undefined> = {
        weekly: { times: 1, per: 'week' },
        fortnightly: { times: 2, per: 'week' }, // 3.5 days: not equivalent, so not used below
        monthly: { times: 1, per: 'month' },
        yearly: { times: 1, per: 'year' },
      };
      const f = e.value === null ? undefined : map[e.value];
      return f && e.value !== 'fortnightly' ? { id: e.id, personId: e.personId, ts: e.ts, field: 'frequency' as const, value: f } : e;
    }),
  });

  it('P21 presets are special cases: "at least once a week/month/year" scores exactly like weekly/monthly/yearly', () => {
    fc.assert(
      fc.property(arbEventLog({ ideals: true }), (log) => {
        expect(score(asCustom(log)).total).toBeCloseTo(score(log).total, 9);
      }),
      RUNS,
    );
  });

  it('a higher minimum frequency expects contact sooner', () => {
    const base: EventLog = {
      people: [{ id: 'a', displayName: 'a' }],
      relationshipEvents: [
        { id: 'c', personId: 'a', ts: ARB_AS_OF - 400 * DAY, field: 'category', value: 'friend' },
        { id: 'i', personId: 'a', ts: ARB_AS_OF - 400 * DAY, field: 'importance', value: 5 },
      ],
      interactions: [{ id: 'x', ts: ARB_AS_OF - 10 * DAY, loggedAt: ARB_AS_OF - 10 * DAY, type: 'in_person', participants: ['a'], source: 'manual' }],
      supportReports: [],
      loggingActivity: [],
      pauses: [],
    };
    const withFreq = (times: number, per: 'week' | 'month') => ({
      ...base,
      relationshipEvents: [...base.relationshipEvents, { id: 'f', personId: 'a', ts: ARB_AS_OF - 400 * DAY, field: 'frequency' as const, value: { times, per } }],
    });
    const monthlyish = score(withFreq(2, 'month')).relationships[0]!;
    const fiveAWeek = score(withFreq(5, 'week')).relationships[0]!;
    expect(monthlyish.expectedIntervalDays).toBeCloseTo(15, 9);
    expect(fiveAWeek.expectedIntervalDays).toBeCloseTo(1.4, 9);
    // Ten days since the last catch-up: on rhythm for twice a month, well behind for five a week.
    expect(monthlyish.onRhythm).toBe(1);
    expect(fiveAWeek.onRhythm).toBe(0);
  });
});

describe('living or working together (model v0.4)', () => {
  const markTogether = (log: EventLog, id: string, value: boolean): EventLog => ({
    ...log,
    relationshipEvents: [...log.relationshipEvents, { id: `t-${id}`, personId: id, ts: ARB_AS_OF - 450 * DAY, field: 'together', value }],
  });

  it('P22 marking someone as living or working with you never lowers the score (default ideals)', () => {
    fc.assert(
      fc.property(arbEventLog(), fc.nat(), (log, pick) => {
        if (log.people.length === 0) return;
        const id = log.people[pick % log.people.length]!.id;
        expect(score(markTogether(log, id, true)).total).toBeGreaterThanOrEqual(score(log).total - EPS);
      }),
      RUNS,
    );
  });

  it('P23 "no" is the standard model: marking everyone as not together changes nothing', () => {
    fc.assert(
      fc.property(arbEventLog({ ideals: true }), (log) => {
        let marked = log;
        for (const p of log.people) marked = markTogether(marked, p.id, false);
        expect(score(marked).total).toBeCloseTo(score(log).total, 9);
      }),
      RUNS,
    );
  });

  it('time apart counts at a tenth: 100 days apart together = 10 days apart otherwise', () => {
    const one = (together: boolean, daysAgo: number): EventLog => ({
      people: [{ id: 'a', displayName: 'a' }],
      relationshipEvents: [
        { id: 'c', personId: 'a', ts: ARB_AS_OF - 400 * DAY, field: 'category', value: 'friend' },
        { id: 't', personId: 'a', ts: ARB_AS_OF - 400 * DAY, field: 'together', value: together },
      ],
      interactions: [{ id: 'x', ts: ARB_AS_OF - daysAgo * DAY, loggedAt: ARB_AS_OF - daysAgo * DAY, type: 'in_person', participants: ['a'], source: 'manual' }],
      supportReports: [],
      loggingActivity: [],
      pauses: [],
    });
    const together = score(one(true, 100)).relationships[0]!;
    const apart = score(one(false, 10)).relationships[0]!;
    expect(together.level).toBeCloseTo(apart.level, 12);
    expect(together.onRhythm).toBeCloseTo(apart.onRhythm!, 12);
    expect(together.lastContactAgeDays).toBeCloseTo(100, 9); // shown as the real time
    expect(together.decayRate).toBe(0.1);
  });
});
