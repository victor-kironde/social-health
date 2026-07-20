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
