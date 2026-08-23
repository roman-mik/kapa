import { describe, it, expect } from 'vitest';
import {
  addDays,
  applySlippage,
  coveredPeriod,
  daysBetween,
  generateDates,
  isWorkingDay,
  monthsBetween,
  nextDatesForSchedules,
  nextSixDates,
  type ScheduleCalendar,
  type ScheduleRule,
} from './schedule';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

function schedule(
  overrides: Partial<ScheduleRule> & { id?: string } = {}
): ScheduleRule & { id: string } {
  return {
    id: 'sc1',
    kind: 'dayOfMonth',
    dayOfMonth: null,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'nextBusinessDay',
    coversPeriod: 'same',
    ...overrides,
  };
}

describe('generateDates', () => {
  it('dayOfMonth: fires on the given day each month in range', () => {
    const dates = generateDates(
      schedule({ kind: 'dayOfMonth', dayOfMonth: 15 }),
      monFri,
      { from: '2026-01-01', to: '2026-03-31' }
    );
    expect(dates).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('dayOfMonth: clamps into a shorter month instead of skipping it', () => {
    const dates = generateDates(
      schedule({ kind: 'dayOfMonth', dayOfMonth: 31 }),
      monFri,
      { from: '2026-01-01', to: '2026-02-28' }
    );
    // February 2026 has 28 days; 31 clamps to the 28th, not a skip.
    expect(dates).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('monthEnd: lands on the actual last day, including a leap February', () => {
    const dates = generateDates(schedule({ kind: 'monthEnd' }), monFri, {
      from: '2028-01-01',
      to: '2028-04-30',
    });
    // 2028 is a leap year.
    expect(dates).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
      '2028-04-30',
    ]);
  });

  it('everyNDays: steps from the anchor, fast-forwarding an anchor before the range', () => {
    const dates = generateDates(
      schedule({
        kind: 'everyNDays',
        intervalDays: 14,
        anchorDate: '2026-01-01',
      }),
      monFri,
      { from: '2026-02-01', to: '2026-03-01' }
    );
    // Anchor + 14*3 = 2026-02-12, + 14*4 = 2026-02-26, + 14*5 = 2026-03-12
    // (past `to`).
    expect(dates).toEqual(['2026-02-12', '2026-02-26']);
  });

  it('everyNDays: includes the anchor itself when inside the range', () => {
    const dates = generateDates(
      schedule({
        kind: 'everyNDays',
        intervalDays: 7,
        anchorDate: '2026-01-05',
      }),
      monFri,
      { from: '2026-01-01', to: '2026-01-19' }
    );
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('nthWeekday: the 3rd Friday of each month', () => {
    const dates = generateDates(
      schedule({ kind: 'nthWeekday', nthWeekday: 3, weekday: 5 }),
      monFri,
      { from: '2026-01-01', to: '2026-02-28' }
    );
    expect(dates).toEqual(['2026-01-16', '2026-02-20']);
  });

  it('nthWeekday: skips a month with no 5th occurrence rather than erroring', () => {
    // January 2026 has only four Fridays (2, 9, 16, 23, 30 -> actually five;
    // pick a month/weekday pair with genuinely four occurrences: February
    // 2026 has four Sundays (1, 8, 15, 22) and no 5th.
    const dates = generateDates(
      schedule({ kind: 'nthWeekday', nthWeekday: 5, weekday: 0 }),
      monFri,
      { from: '2026-02-01', to: '2026-02-28' }
    );
    expect(dates).toEqual([]);
  });

  it('oneOff: fires exactly once, only if the anchor is inside the range', () => {
    const inRange = generateDates(
      schedule({ kind: 'oneOff', anchorDate: '2026-06-15' }),
      monFri,
      { from: '2026-01-01', to: '2026-12-31' }
    );
    expect(inRange).toEqual(['2026-06-15']);

    const outOfRange = generateDates(
      schedule({ kind: 'oneOff', anchorDate: '2027-01-01' }),
      monFri,
      { from: '2026-01-01', to: '2026-12-31' }
    );
    expect(outOfRange).toEqual([]);
  });

  it('returns nothing for an inverted range', () => {
    const dates = generateDates(schedule({ kind: 'monthEnd' }), monFri, {
      from: '2026-03-01',
      to: '2026-01-01',
    });
    expect(dates).toEqual([]);
  });
});

describe('isWorkingDay', () => {
  it('is false on a non-working weekday', () => {
    // 2026-01-03 is a Saturday.
    expect(isWorkingDay('2026-01-03', monFri)).toBe(false);
  });

  it('is false on a stored holiday even if the weekday is a working day', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01'],
    };
    expect(isWorkingDay('2026-01-01', withHoliday)).toBe(false);
  });

  it('is true on an ordinary working weekday', () => {
    // 2026-01-05 is a Monday.
    expect(isWorkingDay('2026-01-05', monFri)).toBe(true);
  });
});

describe('applySlippage', () => {
  it("'none' never shifts, even off a working day", () => {
    expect(applySlippage('2026-01-03', monFri, 'none')).toBe('2026-01-03');
  });

  it('nextBusinessDay walks forward over a weekend', () => {
    // 2026-01-03 is Saturday -> next working day is Monday 2026-01-05.
    expect(applySlippage('2026-01-03', monFri, 'nextBusinessDay')).toBe(
      '2026-01-05'
    );
  });

  it('prevBusinessDay walks backward over a weekend', () => {
    // 2026-01-04 is Sunday -> previous working day is Friday 2026-01-02.
    expect(applySlippage('2026-01-04', monFri, 'prevBusinessDay')).toBe(
      '2026-01-02'
    );
  });

  it('shifts over a holiday landing on an otherwise-working day', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-05'],
    };
    expect(applySlippage('2026-01-05', withHoliday, 'nextBusinessDay')).toBe(
      '2026-01-06'
    );
  });

  it('is a no-op when the date is already a working day', () => {
    expect(applySlippage('2026-01-05', monFri, 'nextBusinessDay')).toBe(
      '2026-01-05'
    );
  });
});

describe('nextSixDates', () => {
  it('flags a shifted date and preserves the original', () => {
    const sc = schedule({
      kind: 'dayOfMonth',
      dayOfMonth: 3,
      slippagePolicy: 'nextBusinessDay',
    });
    // 2026-01-03 is a Saturday.
    const [first] = nextSixDates(sc, monFri, '2026-01-01');
    expect(first).toEqual({
      date: '2026-01-05',
      shifted: true,
      originalDate: '2026-01-03',
    });
  });

  it('returns up to six occurrences, unshifted when already working days', () => {
    const sc = schedule({ kind: 'monthEnd', slippagePolicy: 'none' });
    const dates = nextSixDates(sc, monFri, '2026-01-01');
    expect(dates).toHaveLength(6);
    expect(dates.every((d) => !d.shifted)).toBe(true);
  });
});

describe('nextDatesForSchedules', () => {
  it('merges and sorts occurrences across multiple schedules on a stream', () => {
    const fifteenth = schedule({
      id: 'sc-15',
      kind: 'dayOfMonth',
      dayOfMonth: 15,
      slippagePolicy: 'none',
    });
    const monthEnd = schedule({
      id: 'sc-end',
      kind: 'monthEnd',
      slippagePolicy: 'none',
    });

    const merged = nextDatesForSchedules(
      [fifteenth, monthEnd],
      monFri,
      '2026-01-01',
      4
    );
    expect(merged.map((m) => m.date)).toEqual([
      '2026-01-15',
      '2026-01-31',
      '2026-02-15',
      '2026-02-28',
    ]);
    expect(merged.map((m) => m.scheduleId)).toEqual([
      'sc-15',
      'sc-end',
      'sc-15',
      'sc-end',
    ]);
  });
});

describe('coveredPeriod', () => {
  it('same: the payment month', () => {
    const sc = schedule({ coversPeriod: 'same' });
    expect(coveredPeriod('2026-08-28', sc)).toBe('2026-08');
  });

  it('next: the following month', () => {
    const sc = schedule({ coversPeriod: 'next' });
    expect(coveredPeriod('2026-08-28', sc)).toBe('2026-09');
  });

  it('previous: the prior month', () => {
    const sc = schedule({ coversPeriod: 'previous' });
    expect(coveredPeriod('2026-08-20', sc)).toBe('2026-07');
  });

  it('next: rolls the year over on December', () => {
    const sc = schedule({ coversPeriod: 'next' });
    expect(coveredPeriod('2026-12-15', sc)).toBe('2027-01');
  });

  it('previous: rolls the year back on January', () => {
    const sc = schedule({ coversPeriod: 'previous' });
    expect(coveredPeriod('2026-01-15', sc)).toBe('2025-12');
  });

  it('must be derived from the unslipped date, not the slipped one', () => {
    // 2026-05-31 (monthEnd) is a Sunday and slips to 2026-06-01 under
    // nextBusinessDay. Rent due end-of-May that covers June must still read
    // June even though the payment itself lands in June — passing the
    // slipped date would wrongly push it to July.
    const sc = schedule({
      kind: 'monthEnd',
      coversPeriod: 'next',
      slippagePolicy: 'nextBusinessDay',
    });
    const [occ] = nextSixDates(sc, monFri, '2026-05-01');
    expect(occ).toEqual({
      date: '2026-06-01',
      shifted: true,
      originalDate: '2026-05-31',
    });

    expect(coveredPeriod(occ.originalDate ?? occ.date, sc)).toBe('2026-06');
    expect(coveredPeriod(occ.date, sc)).toBe('2026-07');
  });
});

describe('Date helpers: addDays, daysBetween, monthsBetween', () => {
  describe('addDays', () => {
    it('adds positive days correctly', () => {
      expect(addDays('2026-01-15', 5)).toBe('2026-01-20');
    });

    it('adds days across month boundaries', () => {
      expect(addDays('2026-01-28', 5)).toBe('2026-02-02');
    });

    it('adds days across year boundaries', () => {
      expect(addDays('2025-12-28', 5)).toBe('2026-01-02');
    });

    it('adds zero days returns the same date', () => {
      expect(addDays('2026-01-15', 0)).toBe('2026-01-15');
    });

    it('adds negative days (subtraction)', () => {
      expect(addDays('2026-01-15', -5)).toBe('2026-01-10');
    });

    it('subtracts days across month boundaries', () => {
      expect(addDays('2026-02-05', -5)).toBe('2026-01-31');
    });

    it('subtracts days across year boundaries', () => {
      expect(addDays('2026-01-02', -5)).toBe('2025-12-28');
    });

    it('handles leap year day correctly', () => {
      // 2028 is a leap year; Feb 29 exists
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    });

    it('handles non-leap year February', () => {
      // 2026 is not a leap year; Feb 28 is the last day
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('handles 31st of a month followed by a 30-day month', () => {
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    });

    it('handles end of month to start of next month', () => {
      expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    });

    it('preserves zero-padding in date format', () => {
      const result = addDays('2026-01-01', 1);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toBe('2026-01-02');
    });
  });

  describe('daysBetween', () => {
    it('counts days between two dates', () => {
      expect(daysBetween('2026-01-01', '2026-01-10')).toBe(9);
    });

    it('returns 0 for the same date', () => {
      expect(daysBetween('2026-01-15', '2026-01-15')).toBe(0);
    });

    it('counts days across month boundaries', () => {
      expect(daysBetween('2026-01-28', '2026-02-05')).toBe(8);
    });

    it('counts days across year boundaries', () => {
      expect(daysBetween('2025-12-28', '2026-01-02')).toBe(5);
    });

    it('returns negative when from > to', () => {
      expect(daysBetween('2026-01-10', '2026-01-01')).toBe(-9);
    });

    it('handles leap year correctly', () => {
      // 2028 is a leap year
      expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    });

    it('calculates a full month span', () => {
      expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    });

    it('calculates a full leap February', () => {
      expect(daysBetween('2028-02-01', '2028-02-29')).toBe(28);
    });

    it('calculates a full non-leap February', () => {
      expect(daysBetween('2026-02-01', '2026-02-28')).toBe(27);
    });
  });

  describe('monthsBetween', () => {
    it('returns months between two dates in the same year', () => {
      const result = monthsBetween('2026-01-15', '2026-03-15');
      expect(result).toEqual([
        { year: 2026, month0: 0 },
        { year: 2026, month0: 1 },
        { year: 2026, month0: 2 },
      ]);
    });

    it('returns months across year boundaries', () => {
      const result = monthsBetween('2025-11-15', '2026-02-15');
      expect(result).toEqual([
        { year: 2025, month0: 10 },
        { year: 2025, month0: 11 },
        { year: 2026, month0: 0 },
        { year: 2026, month0: 1 },
      ]);
    });

    it('returns a single month when from and to are in the same month', () => {
      const result = monthsBetween('2026-01-01', '2026-01-31');
      expect(result).toEqual([{ year: 2026, month0: 0 }]);
    });

    it('includes the from month and the to month', () => {
      const result = monthsBetween('2026-01-15', '2026-01-15');
      expect(result).toEqual([{ year: 2026, month0: 0 }]);
    });

    it('handles leap year transitions', () => {
      const result = monthsBetween('2028-02-01', '2028-03-01');
      expect(result).toEqual([
        { year: 2028, month0: 1 },
        { year: 2028, month0: 2 },
      ]);
    });

    it('returns months in correct order', () => {
      const result = monthsBetween('2026-06-01', '2026-12-01');
      expect(result.length).toBe(7);
      expect(result[0].month0).toBe(5);
      expect(result[6].month0).toBe(11);
    });
  });

  describe('Date helpers consistency', () => {
    it('addDays + daysBetween are inverses', () => {
      const start = '2026-01-15';
      const days = 25;
      const end = addDays(start, days);
      const calculated = daysBetween(start, end);
      expect(calculated).toBe(days);
    });

    it('monthsBetween respects month ordering from addDays', () => {
      const start = '2026-01-01';
      const end = addDays(start, 90); // ~3 months forward
      const months = monthsBetween(start, end);
      expect(months.length).toBeGreaterThanOrEqual(3);
    });
  });
});
