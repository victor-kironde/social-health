/**
 * Calendar maths for picking a day, in local dates (year, month 0–11, day). Day differences go
 * through UTC midnights, so daylight-saving changes never make a day count 23 or 25 hours.
 */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export function localDate(ts: number): LocalDate {
  const d = new Date(ts);
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

const dayNumber = (d: LocalDate) => Date.UTC(d.year, d.month, d.day) / 86_400_000;

/** Whole calendar days from `date` back to `today` (0 = today, 1 = yesterday; negative = future). */
export function daysBetween(date: LocalDate, today: LocalDate): number {
  return dayNumber(today) - dayNumber(date);
}

/** The local date `daysAgo` calendar days before `today`. */
export function dateDaysAgo(today: LocalDate, daysAgo: number): LocalDate {
  const d = new Date(Date.UTC(today.year, today.month, today.day - daysAgo));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/** Weeks of a month, Monday first; days outside the month are null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  const lead = (first + 6) % 7; // Monday-first offset
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The month `delta` months after (year, month). */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const m = year * 12 + month + delta;
  return { year: Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "Mon 5 Oct" (adds the year when it is not the current one). */
export function shortDateLabel(d: LocalDate, today: LocalDate): string {
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(d.year, d.month, d.day)).getUTCDay()];
  return `${weekday} ${d.day} ${MONTH_NAMES[d.month]!.slice(0, 3)}${d.year === today.year ? '' : ` ${d.year}`}`;
}
