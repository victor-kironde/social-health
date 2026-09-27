import type { Frequency, Interaction, InteractionType, RelationshipSnapshot, Rhythm } from '@sg/score-engine';
import { dateDaysAgo, daysBetween, type LocalDate } from '../ui/calendar';
import type { StoredEvent } from './codec';

export type PlanUnit = 'day' | 'week' | 'month';

/**
 * A regular meetup you have planned (book club every other Thursday, lunch with Mum on the first
 * of the month). Each date only counts as a catch-up once you confirm it happened. Like a group,
 * a plan is one current record: editing replaces it and deleting removes it.
 */
export interface Plan {
  id: string;
  /** The person or group it is with. */
  withId: string;
  type: InteractionType;
  /** Every `every` `unit`s, starting on `start`. */
  every: number;
  unit: PlanUnit;
  start: LocalDate;
  /** Dates (see dateKey) you said did not happen. */
  skipped: string[];
  /** Whether saving the plan set the relationship's rhythm (so later edits keep it in step). */
  setRhythm: boolean;
  createdAt: number;
}

export const MAX_PLAN_EVERY = 12;
/** Past dates older than this stop asking to be confirmed. */
export const CONFIRM_WINDOW_DAYS = 30;
/** How far back or ahead a plan may start. */
export const MAX_PLAN_START_DAYS = 365;

export function validatePlan(p: Pick<Plan, 'withId' | 'every' | 'unit' | 'start'>, today: LocalDate): string | null {
  if (!p.withId) return 'Choose who it is with.';
  if (!Number.isInteger(p.every) || p.every < 1 || p.every > MAX_PLAN_EVERY) return `Choose how often, from 1 to ${MAX_PLAN_EVERY}.`;
  if (Math.abs(daysBetween(p.start, today)) > MAX_PLAN_START_DAYS) return 'Choose a start date within a year of today.';
  return null;
}

/** "2026-10-23": how a planned date is named in skips and confirmed catch-ups. */
export function dateKey(d: LocalDate): string {
  return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** The `k`th planned date (0 = the start). Monthly plans keep the day, or the month's last day. */
export function nthDate(plan: Pick<Plan, 'every' | 'unit' | 'start'>, k: number): LocalDate {
  const { start, every, unit } = plan;
  if (unit === 'month') {
    const m = start.year * 12 + start.month + k * every;
    const year = Math.floor(m / 12);
    const month = m % 12;
    return { year, month, day: Math.min(start.day, daysInMonth(year, month)) };
  }
  return dateDaysAgo(start, -k * every * (unit === 'week' ? 7 : 1));
}

/** Planned dates from `from` to `to` (inclusive), oldest first. */
export function datesBetween(plan: Pick<Plan, 'every' | 'unit' | 'start'>, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  // Jump close to `from` rather than walking from the start.
  const approx = plan.unit === 'month' ? 31 * plan.every : plan.every * (plan.unit === 'week' ? 7 : 1);
  let k = Math.max(0, Math.floor(daysBetween(plan.start, from) / approx) - 1);
  for (;;) {
    const d = nthDate(plan, k++);
    if (daysBetween(d, to) < 0) break;
    if (daysBetween(d, from) <= 0) out.push(d);
    if (out.length > 400) break;
  }
  return out;
}

/** The interaction confirming a planned date, if there is one. */
export function confirmationOf(planId: string, key: string, interactions: Interaction[]): Interaction | undefined {
  return interactions.find((i) => i.planId === planId && i.planDate === key);
}

export interface PlannedDate {
  plan: Plan;
  date: LocalDate;
  key: string;
  /** Calendar days ago (0 = today, negative = ahead). */
  daysAgo: number;
}

/** Planned dates up to today (within the confirm window) that are neither confirmed nor skipped, oldest first. */
export function toConfirm(plans: Plan[], interactions: Interaction[], today: LocalDate): PlannedDate[] {
  const from = dateDaysAgo(today, CONFIRM_WINDOW_DAYS);
  return plans
    .flatMap((plan) =>
      datesBetween(plan, from, today).map((date) => ({ plan, date, key: dateKey(date), daysAgo: daysBetween(date, today) })),
    )
    .filter((d) => !d.plan.skipped.includes(d.key) && !confirmationOf(d.plan.id, d.key, interactions))
    .sort((a, b) => b.daysAgo - a.daysAgo);
}

/** Each plan's next date after today, soonest first. */
export function comingUp(plans: Plan[], today: LocalDate): PlannedDate[] {
  return plans
    .map((plan) => {
      const tomorrow = dateDaysAgo(today, -1);
      const date = datesBetween(plan, tomorrow, dateDaysAgo(today, -400))[0]!;
      return { plan, date, key: dateKey(date), daysAgo: daysBetween(date, today) };
    })
    .sort((a, b) => b.daysAgo - a.daysAgo);
}

/** "every week", "every 2 weeks", "every month". */
export function planEveryText(p: Pick<Plan, 'every' | 'unit'>): string {
  return p.every === 1 ? `every ${p.unit}` : `every ${p.every} ${p.unit}s`;
}

/**
 * The catch-up rhythm that matches a plan: a preset where one fits, otherwise "at least N a
 * period", rounded down so the rhythm never asks for more than the plan.
 */
export function planRhythm(p: Pick<Plan, 'every' | 'unit'>): { rhythm: Rhythm } | { frequency: Frequency } {
  const { every, unit } = p;
  if (every === 1) return { frequency: { times: 1, per: unit } };
  if (unit === 'week' && every === 2) return { rhythm: 'fortnightly' };
  if (unit === 'month' && every === 3) return { rhythm: 'quarterly' };
  if (unit === 'month' && every === 12) return { rhythm: 'yearly' };
  if (unit === 'day') return every <= 7 ? { frequency: { times: Math.floor(7 / every), per: 'week' } } : { frequency: { times: Math.floor(365 / every), per: 'year' } };
  if (unit === 'week') return { frequency: { times: Math.floor(52 / every), per: 'year' } };
  return { frequency: { times: Math.floor(12 / every), per: 'year' } };
}

/** Whether a relationship's own rhythm is exactly what a plan would set. */
export function rhythmMatchesPlan(rel: Pick<RelationshipSnapshot, 'rhythm' | 'frequency' | 'rhythmSet'>, p: Pick<Plan, 'every' | 'unit'>): boolean {
  if (!rel.rhythmSet) return false;
  const want = planRhythm(p);
  if ('rhythm' in want) return rel.frequency === null && rel.rhythm === want.rhythm;
  return rel.frequency?.times === want.frequency.times && rel.frequency.per === want.frequency.per;
}

/**
 * The relationship events (if any) that keep the rhythm in step with a plan being saved: set it
 * when the user has not chosen one, or follow the plan when the rhythm is still the plan's own.
 * Returns whether the plan now owns the rhythm.
 */
export function planRhythmEvents(
  plan: Plan,
  before: Plan | undefined,
  rel: Pick<RelationshipSnapshot, 'rhythm' | 'frequency' | 'rhythmSet'>,
  now: number,
  newId: () => string,
): { events: StoredEvent[]; setRhythm: boolean } {
  const owns = !rel.rhythmSet || (before !== undefined && before.setRhythm && rhythmMatchesPlan(rel, before));
  if (!owns) return { events: [], setRhythm: false };
  if (rhythmMatchesPlan(rel, plan)) return { events: [], setRhythm: true };
  const want = planRhythm(plan);
  const id = newId();
  const change = 'rhythm' in want ? ({ field: 'rhythm', value: want.rhythm } as const) : ({ field: 'frequency', value: want.frequency } as const);
  return {
    events: [{ id, ts: now, kind: 'relationship', body: { id, personId: plan.withId, ts: now, ...change } }],
    setRhythm: true,
  };
}

/** The stored row for a plan's current state. */
export function planEvent(plan: Plan, now: number): StoredEvent {
  return { id: `plan:${plan.id}`, ts: now, kind: 'plan', body: { ...plan, skipped: [...new Set(plan.skipped)].sort() } };
}

/** Current plans from stored events (the latest record per plan), oldest first. */
export function plansFromEvents(events: StoredEvent[]): Plan[] {
  const latest = new Map<string, { ts: number; plan: Plan }>();
  for (const e of events) {
    if (e.kind !== 'plan') continue;
    const prev = latest.get(e.body.id);
    if (!prev || e.ts >= prev.ts) latest.set(e.body.id, { ts: e.ts, plan: e.body });
  }
  return [...latest.values()].map((x) => x.plan).sort((a, b) => a.createdAt - b.createdAt);
}
