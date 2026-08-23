import { describe, it, expect } from 'vitest';
import {
  annualizedIncome,
  hourlyIncomeForPeriod,
  monthlyIncomeForStream,
  workingDaysBetween,
  workingDaysInMonth,
} from './income-math';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { IncomeSchedule, IncomeStream } from './types';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

function hourlyStream(overrides: Partial<IncomeStream> = {}): IncomeStream {
  return {
    id: 's1',
    accountId: 'a1',
    name: 'Freelance',
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2026-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    kind: 'hourly',
    hourlyRateMinor: 5000 as never,
    hoursPerDay: 8,
    ...overrides,
  } as IncomeStream;
}

function fixedStream(overrides: Partial<IncomeStream> = {}): IncomeStream {
  return {
    id: 's2',
    accountId: 'a1',
    name: 'Retainer',
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2026-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    kind: 'fixed',
    fixedAmountMinor: 100000 as never,
    ...overrides,
  } as IncomeStream;
}

function schedule(overrides: Partial<IncomeSchedule>): IncomeSchedule {
  return {
    id: 'sc1',
    incomeStreamId: 's2',
    kind: 'dayOfMonth',
    dayOfMonth: null,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'none',
    coversPeriod: 'same',
    ...overrides,
  };
}

describe('hourlyIncomeForPeriod', () => {
  it('multiplies rate x hours x working days', () => {
    expect(hourlyIncomeForPeriod(5000, 8, 20)).toBe(800000);
  });

  it('rounds half-up on a fractional result', () => {
    // 3333 * 7.5 * 1 = 24997.5 -> rounds to 24998.
    expect(hourlyIncomeForPeriod(3333, 7.5, 1)).toBe(24998);
  });
});

describe('workingDaysBetween', () => {
  it('a partial month: first half (1st–15th)', () => {
    // January 2026: 1st–15th has 11 working days (Thu–Fri of week 1, Mon–Fri of week 2, Mon–Fri of week 3)
    expect(workingDaysBetween('2026-01-01', '2026-01-15', monFri)).toBe(11);
  });

  it('sub-ranges within a month sum to workingDaysInMonth', () => {
    const first = workingDaysBetween('2026-01-01', '2026-01-15', monFri);
    const second = workingDaysBetween('2026-01-16', '2026-01-31', monFri);
    const total = workingDaysInMonth('2026-01', monFri);
    expect(first + second).toBe(total);
  });

  it('a window crossing a month boundary', () => {
    // Jan 20 (Tue) to Feb 5 (Thu): Jan 20-23, 26-30 (9 days) + Feb 2-5 (4 days) = 13 working days
    expect(workingDaysBetween('2026-01-20', '2026-02-05', monFri)).toBe(13);
  });

  it('a window with no working days (weekend only)', () => {
    // Jan 3-4 is Saturday-Sunday
    expect(workingDaysBetween('2026-01-03', '2026-01-04', monFri)).toBe(0);
  });

  it('an inverted window (from > to) returns 0', () => {
    expect(workingDaysBetween('2026-01-31', '2026-01-01', monFri)).toBe(0);
  });
});

describe('workingDaysInMonth', () => {
  it('counts weekdays only, ignoring holidays when there are none', () => {
    expect(workingDaysInMonth('2026-01', monFri)).toBe(22);
    expect(workingDaysInMonth('2026-02', monFri)).toBe(20);
  });

  it('a holiday landing on a weekday reduces the count by one', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01'], // a Thursday
    };
    expect(workingDaysInMonth('2026-01', withHoliday)).toBe(21);
  });
});

describe('monthlyIncomeForStream', () => {
  it('an hourly stream derives from the calendar, independent of any schedule', () => {
    const stream = hourlyStream();
    expect(monthlyIncomeForStream(stream, [], '2026-01', monFri)).toBe(
      5000 * 8 * 22
    );
    // Fewer working days in February -> lower derived income, no manual edit.
    expect(monthlyIncomeForStream(stream, [], '2026-02', monFri)).toBe(
      5000 * 8 * 20
    );
  });

  it('a fixed stream sums once per matching schedule occurrence in the month', () => {
    const stream = fixedStream();
    const monthly = [schedule({ kind: 'dayOfMonth', dayOfMonth: 15 })];
    expect(monthlyIncomeForStream(stream, monthly, '2026-01', monFri)).toBe(
      100000
    );
  });

  it('a fixed stream with two schedules in one month sums both occurrences', () => {
    const stream = fixedStream();
    const twiceMonthly = [
      schedule({ id: 'sc-a', kind: 'dayOfMonth', dayOfMonth: 15 }),
      schedule({ id: 'sc-b', kind: 'monthEnd' }),
    ];
    expect(
      monthlyIncomeForStream(stream, twiceMonthly, '2026-01', monFri)
    ).toBe(200000);
  });

  it('a quarterly fixed stream contributes zero in a month it does not fire', () => {
    const stream = fixedStream();
    const quarterly = [
      schedule({
        kind: 'everyNDays',
        intervalDays: 90,
        anchorDate: '2026-01-15',
      }),
    ];
    expect(monthlyIncomeForStream(stream, quarterly, '2026-02', monFri)).toBe(
      0
    );
  });
});

describe('annualizedIncome', () => {
  it('excludes one-off streams by default', () => {
    const recurring = fixedStream({ id: 's-a' });
    const oneOff = fixedStream({ id: 's-b', recurrence: 'oneOff' });
    const schedules = [
      schedule({ id: 'sc-a', incomeStreamId: 's-a', kind: 'monthEnd' }),
      schedule({ id: 'sc-b', incomeStreamId: 's-b', kind: 'monthEnd' }),
    ];

    const withoutOneOff = annualizedIncome(
      [recurring, oneOff],
      schedules,
      monFri,
      2026
    );
    expect(withoutOneOff).toBe(100000 * 12);

    const withOneOff = annualizedIncome(
      [recurring, oneOff],
      schedules,
      monFri,
      2026,
      { includeOneOff: true }
    );
    expect(withOneOff).toBe(100000 * 12 * 2);
  });

  it('excludes archived streams regardless of the toggle', () => {
    const archived = fixedStream({ id: 's-c', archived: true });
    const schedules = [
      schedule({ id: 'sc-c', incomeStreamId: 's-c', kind: 'monthEnd' }),
    ];
    expect(
      annualizedIncome([archived], schedules, monFri, 2026, {
        includeOneOff: true,
      })
    ).toBe(0);
  });
});

describe('Edge cases for workingDaysBetween and workingDaysInMonth', () => {
  it('single-day window where the day is a working day counts as 1', () => {
    // 2026-01-05 is a Monday (working day)
    expect(workingDaysBetween('2026-01-05', '2026-01-05', monFri)).toBe(1);
  });

  it('single-day window where the day is not a working day counts as 0', () => {
    // 2026-01-03 is a Saturday
    expect(workingDaysBetween('2026-01-03', '2026-01-03', monFri)).toBe(0);
  });

  it('a window spanning a year boundary counts working days correctly', () => {
    // Dec 28, 2025 (Sun) to Jan 2, 2026 (Fri)
    // Working days: Dec 29 (Mon), 30 (Tue), 31 (Wed), Jan 1 (Thu), 2 (Fri) = 5 days
    expect(workingDaysBetween('2025-12-28', '2026-01-02', monFri)).toBe(5);
  });

  it('workingDaysInMonth with holidays in the middle reduces count correctly', () => {
    const withHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-15'], // a Thursday
    };
    expect(workingDaysInMonth('2026-01', withHoliday)).toBe(21);
  });

  it('workingDaysInMonth with multiple holidays', () => {
    const withHolidays: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01', '2026-01-05', '2026-01-15'], // Thu, Mon, Thu
    };
    expect(workingDaysInMonth('2026-01', withHolidays)).toBe(19);
  });

  it('February in a leap year has correct day count', () => {
    // 2028-02 is a leap year February with 29 days
    // First day is a Thursday, so: 2 weekends = 8 weekend days, 29-8 = 21 working days
    expect(workingDaysInMonth('2028-02', monFri)).toBe(21);
  });

  it('February in a non-leap year', () => {
    // 2026-02 has 28 days, starts on a Sunday
    // 4 full weekends + 1 Saturday = 9 weekend days, 28-9 = 19 working days
    expect(workingDaysInMonth('2026-02', monFri)).toBe(20); // 1 Sun at start, 4 weekends, 1 Sat at end but one overlaps
  });

  it('a month starting on a weekend', () => {
    // 2026-02-01 is a Sunday; just verify the calculation works
    expect(workingDaysInMonth('2026-02', monFri)).toBe(20);
  });

  it('a month ending on a weekday', () => {
    // 2026-03-31 is a Tuesday; verify it counts correctly
    // March 2026: 31 days, starting Thursday = 22 working days
    expect(workingDaysInMonth('2026-03', monFri)).toBe(22);
  });

  it('partition additivity: three sub-ranges sum to the whole month', () => {
    const first = workingDaysBetween('2026-01-01', '2026-01-10', monFri);
    const second = workingDaysBetween('2026-01-11', '2026-01-20', monFri);
    const third = workingDaysBetween('2026-01-21', '2026-01-31', monFri);
    const total = workingDaysInMonth('2026-01', monFri);
    expect(first + second + third).toBe(total);
  });

  it('with an empty workingWeekdays array, no days are counted', () => {
    const noWorkingDays: ScheduleCalendar = {
      workingWeekdays: [],
      holidays: [],
    };
    expect(workingDaysInMonth('2026-01', noWorkingDays)).toBe(0);
    expect(workingDaysBetween('2026-01-01', '2026-01-31', noWorkingDays)).toBe(
      0
    );
  });

  it('with weekends as working days, counts all days except holidays', () => {
    const always7days: ScheduleCalendar = {
      workingWeekdays: [0, 1, 2, 3, 4, 5, 6], // every day
      holidays: [],
    };
    expect(workingDaysInMonth('2026-01', always7days)).toBe(31);
  });

  it('with a holiday at the month boundary, it is counted', () => {
    const withFirstDayHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-01'], // Thursday
    };
    // Normal Jan 2026 has 22 working days; removing the 1st = 21
    expect(workingDaysInMonth('2026-01', withFirstDayHoliday)).toBe(21);
  });

  it('with a holiday at the last working day of the month, it is counted', () => {
    const withFridayHoliday: ScheduleCalendar = {
      ...monFri,
      holidays: ['2026-01-30'], // Friday
    };
    // Normal Jan 2026 has 22 working days; removing Friday the 30th = 21
    expect(workingDaysInMonth('2026-01', withFridayHoliday)).toBe(21);
  });
});
