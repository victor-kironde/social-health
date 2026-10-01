import { DEFAULT_CONFIG, computeScore, resolveRelationships, type Interaction } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { appendToLog, emptyLog, logFromRows, toRow } from '../src/data/codec';
import { eraseFromLog } from '../src/data/erase';
import { newInteractionEvents } from '../src/data/interactions';
import { newPersonEvents } from '../src/data/people';
import {
  comingUp,
  normalisePlan,
  planName,
  datesBetween,
  dateKey,
  nthDate,
  planEvent,
  planRhythm,
  planRhythmEvents,
  plansFromEvents,
  toConfirm,
  validatePlan,
  type Plan,
} from '../src/data/plans';
import type { LocalDate } from '../src/ui/calendar';

const d = (year: number, month: number, day: number): LocalDate => ({ year, month: month - 1, day });
const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'pl',
  withIds: ['p1'],
  repeat: true,
  type: 'in_person',
  every: 1,
  unit: 'week',
  start: d(2026, 9, 3),
  skipped: [],
  setRhythm: false,
  createdAt: 0,
  ...over,
});
const confirmed = (date: string, planId = 'pl'): Interaction => ({
  id: date,
  ts: 0,
  loggedAt: 0,
  type: 'in_person',
  participants: ['p1'],
  source: 'manual',
  planId,
  planDate: date,
});

const relFor = (log: ReturnType<typeof emptyLog>) => resolveRelationships(log.relationshipEvents, DEFAULT_CONFIG, 10).get('p1')!;
let n = 0;
const id = () => `id${n++}`;
const base = appendToLog(emptyLog(), newPersonEvents({ displayName: 'Ana', category: 'friend', importance: 5, quality: null }, 1, () => 'p1'));

describe('planned dates', () => {
  it('repeats every N days or weeks', () => {
    expect(dateKey(nthDate(plan({ every: 2 }), 3))).toBe('2026-10-15');
    expect(dateKey(nthDate(plan({ unit: 'day', every: 3 }), 2))).toBe('2026-09-09');
  });

  it('keeps the day of the month, or the last day of a shorter month', () => {
    const p = plan({ unit: 'month', start: d(2026, 1, 31) });
    expect([0, 1, 2, 3].map((k) => dateKey(nthDate(p, k)))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('lists dates in a range, never before the start', () => {
    expect(datesBetween(plan(), d(2026, 8, 1), d(2026, 9, 20)).map(dateKey)).toEqual(['2026-09-03', '2026-09-10', '2026-09-17']);
  });

  it('asks to confirm recent dates up to today, minus skipped and confirmed ones', () => {
    const p = plan({ skipped: ['2026-10-01'] });
    const pending = toConfirm([p], [confirmed('2026-09-24')], d(2026, 10, 8));
    // 30 days back from 8 Oct is 8 Sep: 10, 17 Sep; 24 Sep confirmed; 1 Oct skipped; 8 Oct (today).
    expect(pending.map((x) => x.key)).toEqual(['2026-09-10', '2026-09-17', '2026-10-08']);
    expect(pending.at(-1)!.daysAgo).toBe(0);
  });

  it('a confirmation only counts for its own plan', () => {
    expect(toConfirm([plan()], [confirmed('2026-10-08', 'other')], d(2026, 10, 8)).map((x) => x.key)).toContain('2026-10-08');
  });

  it('shows each plan’s next date after today, soonest first', () => {
    const next = comingUp([plan({ id: 'a', unit: 'month' }), plan({ id: 'b' })], d(2026, 10, 8));
    expect(next.map((x) => [x.plan.id, x.key])).toEqual([
      ['b', '2026-10-15'],
      ['a', '2026-11-03'],
    ]);
  });

  it('a plan starting in the future comes up on its start date and asks nothing yet', () => {
    const p = plan({ start: d(2026, 12, 1) });
    expect(toConfirm([p], [], d(2026, 10, 8))).toEqual([]);
    expect(comingUp([p], d(2026, 10, 8))[0]!.key).toBe('2026-12-01');
  });

  it('validates who, how often and the start date', () => {
    const today = d(2026, 10, 8);
    expect(validatePlan(plan(), today)).toBeNull();
    expect(validatePlan(plan({ withIds: [] }), today)).toMatch(/who/);
    expect(validatePlan(plan({ every: 0 }), today)).toMatch(/how often/);
    expect(validatePlan(plan({ start: d(2028, 1, 1) }), today)).toMatch(/year/);
  });
});

describe('plans and rhythm', () => {
  it('maps a plan to a rhythm that never asks for more than the plan', () => {
    expect(planRhythm({ every: 1, unit: 'week' })).toEqual({ frequency: { times: 1, per: 'week' } });
    expect(planRhythm({ every: 2, unit: 'week' })).toEqual({ rhythm: 'fortnightly' });
    expect(planRhythm({ every: 3, unit: 'month' })).toEqual({ rhythm: 'quarterly' });
    expect(planRhythm({ every: 2, unit: 'day' })).toEqual({ frequency: { times: 3, per: 'week' } });
    expect(planRhythm({ every: 3, unit: 'week' })).toEqual({ frequency: { times: 17, per: 'year' } });
    expect(planRhythm({ every: 2, unit: 'month' })).toEqual({ frequency: { times: 6, per: 'year' } });
  });


  it('sets the rhythm when the user has not chosen one, and follows later plan edits', () => {
    const first = planRhythmEvents(plan(), undefined, relFor(base), 5, id);
    expect(first.setRhythm).toBe(true);
    const log1 = appendToLog(base, first.events);
    expect(relFor(log1).frequency).toEqual({ times: 1, per: 'week' });

    const edited = plan({ every: 2, setRhythm: true });
    const second = planRhythmEvents(edited, plan({ setRhythm: true }), relFor(log1), 6, id);
    expect(second.setRhythm).toBe(true);
    const log2 = appendToLog(log1, second.events);
    expect(relFor(log2)).toMatchObject({ rhythm: 'fortnightly', frequency: null });
  });

  it('leaves a rhythm the user chose alone', () => {
    const own = appendToLog(base, [{ id: 'r', ts: 2, kind: 'relationship', body: { id: 'r', personId: 'p1', ts: 2, field: 'rhythm', value: 'monthly' } }]);
    const out = planRhythmEvents(plan(), undefined, relFor(own), 5, id);
    expect(out).toEqual({ events: [], setRhythm: false });
  });
});

describe('plan storage and privacy', () => {
  it('keeps the latest record of each plan and leaves them out of the scoring log', () => {
    const events = [planEvent(plan(), 1), planEvent(plan({ every: 2 }), 2), planEvent(plan({ id: 'b' }), 3)];
    expect(plansFromEvents(events).map((p) => [p.id, p.every])).toEqual([
      ['pl', 2],
      ['b', 1],
    ]);
    expect(logFromRows(events.map(toRow)).people).toEqual([]);
  });

  it('a confirmed meetup is an ordinary catch-up that remembers its plan date', () => {
    const [e] = newInteractionEvents({ participants: ['p1'], type: 'in_person', daysAgo: 0, plan: { id: 'pl', date: '2026-10-08' } }, 100, 0, () => 'i');
    expect(e!.body).toMatchObject({ planId: 'pl', planDate: '2026-10-08', participants: ['p1'] });
    const log = appendToLog(base, [e!]);
    expect(computeScore(log, DEFAULT_CONFIG, 100).relationships.find((r) => r.personId === 'p1')!.lastContactAgeDays).toBe(0);
  });

  it('erasing someone removes their plans', () => {
    const events = [planEvent(plan(), 1), planEvent(plan({ id: 'b', withIds: ['p2'] }), 1)];
    expect(eraseFromLog(events, 'p1').remove).toEqual(['plan:pl']);
  });
});

describe('one-off and shared meetups', () => {
  it('a one-off meetup has a single date: coming up before it, to confirm after it', () => {
    const p = plan({ repeat: false, start: d(2026, 10, 10) });
    expect(comingUp([p], d(2026, 10, 8)).map((x) => x.key)).toEqual(['2026-10-10']);
    expect(toConfirm([p], [], d(2026, 10, 8))).toEqual([]);
    expect(toConfirm([p], [], d(2026, 10, 12)).map((x) => x.key)).toEqual(['2026-10-10']);
    expect(comingUp([p], d(2026, 10, 12))).toEqual([]);
  });

  it('reads plans saved before meetups could be shared or one-off as repeating, with one person', () => {
    const { withIds: _w, repeat: _r, ...old } = plan();
    const legacy = { ...old, withId: 'p9' } as unknown as Plan;
    expect(normalisePlan(legacy)).toMatchObject({ withIds: ['p9'], repeat: true });
    expect(plansFromEvents([{ id: 'plan:pl', ts: 1, kind: 'plan', body: legacy }])[0]).toMatchObject({ withIds: ['p9'], repeat: true });
  });

  it('names a plan by its title, or by who it is with', () => {
    const names = new Map([['a', 'Ana'], ['b', 'Ben'], ['g', 'Book club']]);
    expect(planName({ withIds: ['a'] }, names)).toBe('Ana');
    expect(planName({ withIds: ['a', 'b', 'g'] }, names)).toBe('Ana, Ben and Book club');
    expect(planName({ withIds: ['a', 'b'], title: ' Lunch ' }, names)).toBe('Lunch');
  });

  it('only a repeating plan with one person or group sets a rhythm', () => {
    const rel = { rhythm: 'monthly' as const, frequency: null, rhythmSet: false };
    expect(planRhythmEvents(plan({ repeat: false }), undefined, rel, 5, () => 'x').setRhythm).toBe(false);
    expect(planRhythmEvents(plan({ withIds: ['p1', 'p2'] }), undefined, rel, 5, () => 'x').setRhythm).toBe(false);
    expect(planRhythmEvents(plan(), undefined, rel, 5, () => 'x').setRhythm).toBe(true);
  });

  it('erasing someone takes them out of a shared plan, and removes a plan left with nobody', () => {
    const shared = planEvent(plan({ id: 's', withIds: ['p1', 'p2'] }), 1);
    const solo = planEvent(plan({ id: 'o', withIds: ['p1'] }), 1);
    const out = eraseFromLog([shared, solo], 'p1');
    expect(out.remove).toEqual(['plan:o']);
    expect(out.replace).toHaveLength(1);
    expect((out.replace[0]!.body as Plan).withIds).toEqual(['p2']);
  });

  it('needs at least one person or group', () => {
    expect(validatePlan(plan({ withIds: [] }), d(2026, 10, 8))).toMatch(/who/);
    expect(validatePlan(plan({ repeat: false, every: 0 }), d(2026, 10, 8))).toBeNull();
  });
});
