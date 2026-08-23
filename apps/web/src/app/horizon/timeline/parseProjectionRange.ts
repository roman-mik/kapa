/**
 * URL parameter parsing for /horizon/timeline range control.
 * §3k: Authoritative range-parsing specification.
 *
 * All date strings are YYYY-MM-DD. Validation is strict: day-of-month must be
 * valid for that month/year (no 2026-02-30), and months must be 1–12.
 * Clamping is defensive: from >= today, to >= from, range <= MAX_RANGE_DAYS.
 */

import { addDays } from '@/lib/horizon/schedule';
import { daysInMonth } from '@/lib/horizon/schedule';

const MAX_RANGE_DAYS = 1826; // Five years

function isValidDateString(date: string): boolean {
  if (!date || typeof date !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const [yearStr, monthStr, dayStr] = date.split('-');
  const year = parseInt(yearStr, 10);
  const month0 = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  if (month0 < 0 || month0 > 11) return false;
  if (day < 1) return false;

  const maxDaysInMonth = daysInMonth(year, month0);
  if (day > maxDaysInMonth) return false;

  return true;
}

function sameDayNextYear(date: string): string {
  const [yearStr, monthStr, dayStr] = date.split('-');
  const year = parseInt(yearStr, 10);
  const month0 = parseInt(monthStr, 10) - 1;
  let day = parseInt(dayStr, 10);

  const nextYear = year + 1;
  const maxDaysInNextMonth = daysInMonth(nextYear, month0);

  if (day > maxDaysInNextMonth) {
    day = maxDaysInNextMonth;
  }

  return `${nextYear}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type ProjectionView = 'line' | 'waterfall' | 'table';

export interface ParsedProjectionRange {
  from: string;
  to: string;
  view: ProjectionView;
}

export function parseProjectionRange(
  searchParams: Record<string, string | string[] | undefined>,
  today: string
): ParsedProjectionRange {
  const fromParam =
    typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const toParam =
    typeof searchParams.to === 'string' ? searchParams.to : undefined;
  const viewParam =
    typeof searchParams.view === 'string' ? searchParams.view : undefined;

  let from = today;
  if (fromParam && isValidDateString(fromParam)) {
    from = fromParam < today ? today : fromParam;
  }

  let to = sameDayNextYear(today);
  if (toParam && isValidDateString(toParam)) {
    to = toParam;
  }

  if (to < from) {
    to = from;
  }

  const daySpan =
    Math.floor(
      (new Date(to + 'T00:00:00Z').getTime() -
        new Date(from + 'T00:00:00Z').getTime()) /
        86_400_000
    ) + 1;
  if (daySpan > MAX_RANGE_DAYS) {
    to = addDays(from, MAX_RANGE_DAYS - 1);
  }

  const view: ProjectionView =
    viewParam === 'line' || viewParam === 'waterfall' || viewParam === 'table'
      ? viewParam
      : 'line';

  return { from, to, view };
}
