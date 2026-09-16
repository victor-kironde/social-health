import { describe, expect, it } from 'vitest';
import { addMonths, dateDaysAgo, daysBetween, monthGrid, shortDateLabel } from '../src/ui/calendar';

describe('calendar maths', () => {
  it('lays out months Monday first, with whole weeks', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const oct = monthGrid(2026, 9);
    expect(oct[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(oct.flat().filter((d) => d !== null)).toHaveLength(31);
    expect(oct.every((w) => w.length === 7)).toBe(true);
    // February 2027 starts on a Monday (28 days, exactly four weeks).
    expect(monthGrid(2027, 1)).toHaveLength(4);
  });

  it('counts calendar days, unaffected by daylight saving', () => {
    const today = { year: 2026, month: 9, day: 26 }; // the day after the UK clocks change
    expect(daysBetween({ year: 2026, month: 9, day: 24 }, today)).toBe(2);
    expect(daysBetween(today, today)).toBe(0);
    expect(daysBetween({ year: 2026, month: 9, day: 27 }, today)).toBe(-1);
    expect(daysBetween({ year: 2025, month: 9, day: 26 }, today)).toBe(365);
  });

  it('goes back days and months across year boundaries', () => {
    expect(dateDaysAgo({ year: 2026, month: 0, day: 2 }, 3)).toEqual({ year: 2025, month: 11, day: 30 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('labels dates briefly, adding the year only when it differs', () => {
    const today = { year: 2026, month: 9, day: 8 };
    expect(shortDateLabel({ year: 2026, month: 9, day: 5 }, today)).toBe('Mon 5 Oct');
    expect(shortDateLabel({ year: 2025, month: 11, day: 25 }, today)).toBe('Thu 25 Dec 2025');
  });
});
