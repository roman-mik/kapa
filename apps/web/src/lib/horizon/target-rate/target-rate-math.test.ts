import { describe, it, expect } from 'vitest';
import {
  monthlyCommitmentTotal,
  grossUpForTax,
  costPerNetUnit,
  solveTargetRate,
} from './target-rate-math';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { FxRate } from '@/lib/horizon/types';
import type {
  Obligation,
  ObligationSchedule,
  DailyExpense,
} from '@/lib/horizon/spending/types';
import type { IncomeStream } from '@/lib/horizon/income/types';

const monFri: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

function obligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'o1',
    accountId: 'a1',
    name: 'Rent',
    category: 'housing',
    amountMinor: 50000 as never,
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    startDate: '2020-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    ...overrides,
  };
}

function schedule(overrides: Partial<ObligationSchedule> = {}): ObligationSchedule {
  return {
    id: 'os1',
    obligationId: 'o1',
    kind: 'dayOfMonth',
    dayOfMonth: 1,
    intervalDays: null,
    nthWeekday: null,
    weekday: null,
    anchorDate: null,
    slippagePolicy: 'none',
    coversPeriod: 'same',
    ...overrides,
  };
}

function dailyExpense(overrides: Partial<DailyExpense> = {}): DailyExpense {
  return {
    id: 'd1',
    accountId: 'a1',
    pocketCategoryId: null,
    name: 'Groceries',
    dailyAmountMinor: 1000 as never,
    currency: 'RSD',
    chargeCadence: 'daily',
    capMinor: null,
    startDate: '2020-01-01',
    endDate: null,
    archived: false,
    ...overrides,
  };
}

function hourlyStream(overrides: Partial<IncomeStream> = {}): IncomeStream {
  return {
    id: 's1',
    accountId: 'a1',
    name: 'Freelance',
    currency: 'RSD',
    recurrence: 'recurring',
    confidence: 'confirmed',
    taxable: true,
    startDate: '2020-01-01',
    endDate: null,
    sortOrder: 0,
    archived: false,
    kind: 'hourly',
    hourlyRateMinor: 5000 as never,
    hoursPerDay: 8,
    ...overrides,
  } as IncomeStream;
}

const eurToRsd: FxRate = {
  baseCode: 'EUR',
  quoteCode: 'RSD',
  rateE8: 117_000_000,
  asOfDate: '2026-01-01',
  source: 'test',
};

describe('monthlyCommitmentTotal', () => {
  it('sums a monthly obligation and a daily expense over a 31-day month', () => {
    const total = monthlyCommitmentTotal(
      [obligation({ amountMinor: 50000 as never })],
      [schedule()],
      [dailyExpense({ dailyAmountMinor: 1000 as never })],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31'
    );
    // one occurrence of the obligation + 31 days x 1000.
    expect(total.totalMinor).toBe(50000 + 31 * 1000);
    expect(total.hasMissingRate).toBe(false);
  });

  it('excludes archived rows', () => {
    const total = monthlyCommitmentTotal(
      [obligation({ archived: true })],
      [schedule()],
      [dailyExpense({ archived: true })],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31'
    );
    expect(total.totalMinor).toBe(0);
  });

  it('clamps by startDate/endDate', () => {
    // Obligation ends before the month starts -> no occurrence.
    const total = monthlyCommitmentTotal(
      [obligation({ endDate: '2025-12-31' })],
      [schedule()],
      [],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31'
    );
    expect(total.totalMinor).toBe(0);
  });

  it('converts currency via fx.ts and flags a missing rate', () => {
    const withRate = monthlyCommitmentTotal(
      [obligation({ currency: 'EUR', amountMinor: 100 as never })],
      [schedule()],
      [],
      '2026-01',
      monFri,
      'RSD',
      [eurToRsd],
      '2026-01-31'
    );
    expect(withRate.totalMinor).toBeGreaterThan(0);
    expect(withRate.hasMissingRate).toBe(false);

    const withoutRate = monthlyCommitmentTotal(
      [obligation({ currency: 'EUR', amountMinor: 100 as never })],
      [schedule()],
      [],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31'
    );
    expect(withoutRate.totalMinor).toBe(0);
    expect(withoutRate.hasMissingRate).toBe(true);
  });
});

describe('grossUpForTax', () => {
  it('grosses up net + fixed at the marginal rate', () => {
    // net 90000, fixed 10000, marginal 10% -> (90000+10000)/0.9 = 111111.11 -> 111111
    expect(grossUpForTax(90000, 10000, 1000)).toBe(111111);
  });

  it('with zero marginal rate, gross equals net + fixed', () => {
    expect(grossUpForTax(50000, 5000, 0)).toBe(55000);
  });
});

describe('costPerNetUnit', () => {
  it('is 1/(1-rate)', () => {
    expect(costPerNetUnit(1000)).toBeCloseTo(1 / 0.9);
    expect(costPerNetUnit(0)).toBe(1);
  });
});

describe('solveTargetRate', () => {
  it('solves end to end', () => {
    const result = solveTargetRate(
      [obligation({ amountMinor: 50000 as never })],
      [schedule()],
      [dailyExpense({ dailyAmountMinor: 1000 as never })],
      [hourlyStream({ hoursPerDay: 8 })],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31',
      10000,
      1000
    );
    const netTarget = 50000 + 31 * 1000;
    const grossRequired = Math.round((netTarget + 10000) / 0.9);
    // 22 working days in Jan 2026 (Mon-Fri) x 8h.
    expect(result.billableHours).toBe(22 * 8);
    expect(result.grossRequiredMinor).toBe(grossRequired);
    expect(result.requiredHourlyRateMinor).toBe(
      Math.round(grossRequired / (22 * 8))
    );
  });

  it('returns a null rate when there are no billable hours', () => {
    const result = solveTargetRate(
      [obligation()],
      [schedule()],
      [],
      [],
      '2026-01',
      monFri,
      'RSD',
      [],
      '2026-01-31',
      0,
      0
    );
    expect(result.billableHours).toBe(0);
    expect(result.requiredHourlyRateMinor).toBeNull();
  });
});
