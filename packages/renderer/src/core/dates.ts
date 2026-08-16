/**
 * Calendar-date helpers (Phase 2 §6.4). DATE answers are ISO `YYYY-MM-DD`
 * strings, forever — no time, no timezone (§1.3). All comparison is plain
 * string comparison after format validation (§4.3); the only use of the
 * platform clock is deriving the respondent's local calendar date.
 */

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
}

/** Format-and-calendar-valid ISO date (rejects 2026-02-30, month 13, …). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDate(value: string): CalendarDate {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

/** The respondent's local calendar date — the single clock read (§6.4). */
export function localToday(): string {
  const now = new Date();
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Parses manual entry: ISO `YYYY-MM-DD` or locale `MM/DD/YYYY` (§6.4).
 * Returns the ISO string, or null when unparseable/invalid.
 */
export function parseDateInput(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  let candidate: string | null = null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    candidate = toIsoDate(y, m, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [m, d, y] = text.split('/').map(Number);
    candidate = toIsoDate(y, m, d);
  }
  return candidate !== null && isValidIsoDate(candidate) ? candidate : null;
}

/** Day-of-week for a calendar date, 0 = Sunday. Sakamoto's algorithm. */
export function dayOfWeek(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
}
