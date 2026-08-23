import { describe, it, expect } from 'vitest';
import type { Projection } from './types';
import type { Money } from '@/lib/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import { projectionMetrics } from './metrics';

describe('projectionMetrics', () => {
  it('renders finite numbers for a one-day range', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-15',
      to: '2026-01-15',
      today: '2026-01-15',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(Number.isFinite(metrics.monthlySurplusMinor.value)).toBe(true);
    expect(Number.isFinite(metrics.annualEquivalentMinor.value)).toBe(true);
    expect(
      metrics.runwayMonths.value === null ||
        Number.isFinite(metrics.runwayMonths.value)
    ).toBe(true);
    expect(
      metrics.firstNegativeDate.value === null ||
        typeof metrics.firstNegativeDate.value === 'string'
    ).toBe(true);

    // One-day range should have shortRange caveat
    expect(metrics.monthlySurplusMinor.caveatKey).toBe('shortRange');
    expect(metrics.annualEquivalentMinor.caveatKey).toBe('shortRange');
  });

  it('excludes one-offs from annualEquivalentMinor', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 600000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 600000 as Money,
              convertedMinor: 600000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [
        {
          date: '2026-01-15',
          originalDate: '2026-01-15',
          shifted: false,
          kind: 'income',
          label: 'Salary',
          sourceId: 'stream1',
          scheduleId: 'sched1',
          occurrenceIndex: 0,
          amountMinor: 100000 as Money,
          currency: 'USD',
          accountId: 'acc1',
          convertedMinor: 100000,
          unconvertible: false,
          recurrence: 'recurring',
          confidence: 'confirmed',
          derivation: 'entered',
          coveredPeriod: null,
          balanceBeforeMinor: 0,
          balanceAfterMinor: 100000,
        },
        {
          date: '2026-02-15',
          originalDate: '2026-02-15',
          shifted: false,
          kind: 'oneOffIn',
          label: 'Bonus',
          sourceId: 'oneoff1',
          scheduleId: null,
          occurrenceIndex: 0,
          amountMinor: 500000 as Money,
          currency: 'USD',
          accountId: 'acc1',
          convertedMinor: 500000,
          unconvertible: false,
          recurrence: 'oneOff',
          confidence: 'confirmed',
          derivation: 'entered',
          coveredPeriod: null,
          balanceBeforeMinor: 100000,
          balanceAfterMinor: 600000,
        },
      ],
      monthPoints: [],
      openingTotalMinor: 0,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-01',
      to: '2026-12-31',
      today: '2026-01-01',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    // monthlySurplus should include the bonus
    const monthlyInclusive = metrics.monthlySurplusMinor.value;

    // annualEquivalent should exclude the bonus
    const annualExclusive = metrics.annualEquivalentMinor.value;

    // Annual should be much smaller since it excludes the 500k bonus
    expect(annualExclusive).toBeLessThan(monthlyInclusive * 10);

    // Check that excluded amounts are in inputs
    expect(metrics.annualEquivalentMinor.inputs.excludedOneOffInflowMinor).toBe(
      500000
    );
    expect(metrics.annualEquivalentMinor.inputs.excludedOneOffCount).toBe(1);
  });

  it('returns null for runwayMonths when surplus is non-negative', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
        {
          date: '2026-01-16',
          totalMinor: 102000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 102000 as Money,
              convertedMinor: 102000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [
        {
          date: '2026-01-16',
          originalDate: '2026-01-16',
          shifted: false,
          kind: 'income',
          label: 'Salary',
          sourceId: 'stream1',
          scheduleId: 'sched1',
          occurrenceIndex: 0,
          amountMinor: 2000 as Money,
          currency: 'USD',
          accountId: 'acc1',
          convertedMinor: 2000,
          unconvertible: false,
          recurrence: 'recurring',
          confidence: 'confirmed',
          derivation: 'entered',
          coveredPeriod: null,
          balanceBeforeMinor: 100000,
          balanceAfterMinor: 102000,
        },
      ],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-15',
      to: '2026-12-31',
      today: '2026-01-15',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(metrics.runwayMonths.value).toBeNull();
  });

  it('firstNegativeDate matches the first negative total', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
        {
          date: '2026-01-16',
          totalMinor: 50000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 50000 as Money,
              convertedMinor: 50000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
        {
          date: '2026-01-17',
          totalMinor: -10000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: -10000 as Money,
              convertedMinor: -10000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-15',
      to: '2026-01-17',
      today: '2026-01-15',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(metrics.firstNegativeDate.value).toBe('2026-01-17');
  });

  it('has shortRange caveat for ranges < 28 days', () => {
    const projection: Projection = {
      dailyBalances: Array.from({ length: 10 }, (_, i) => ({
        date: `2026-01-${15 + i}`,
        totalMinor: 100000,
        accounts: [
          {
            accountId: 'acc1',
            balanceMinor: 100000 as Money,
            convertedMinor: 100000,
            includeInTotal: true,
            currency: 'USD',
          },
        ],
      })),
      events: [],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-15',
      to: '2026-01-24',
      today: '2026-01-15',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(metrics.monthlySurplusMinor.caveatKey).toBe('shortRange');
    expect(metrics.annualEquivalentMinor.caveatKey).toBe('shortRange');
    expect(metrics.runwayMonths.caveatKey).toBe('shortRange');
  });

  it('no shortRange caveat for ranges >= 28 days', () => {
    const projection: Projection = {
      dailyBalances: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-01-${1 + i}`,
        totalMinor: 100000,
        accounts: [
          {
            accountId: 'acc1',
            balanceMinor: 100000 as Money,
            convertedMinor: 100000,
            includeInTotal: true,
            currency: 'USD',
          },
        ],
      })),
      events: [],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-01',
      to: '2026-01-30',
      today: '2026-01-01',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(metrics.monthlySurplusMinor.caveatKey).toBeNull();
    expect(metrics.annualEquivalentMinor.caveatKey).toBeNull();
  });

  it('breakEvenRateMinor is null with no hourly-derived income in range', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [],
      monthPoints: [],
      openingTotalMinor: 100000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(projection, {
      from: '2026-01-15',
      to: '2026-01-15',
      today: '2026-01-15',
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    });

    expect(metrics.breakEvenRateMinor.value).toBeNull();
    expect(metrics.breakEvenRateMinor.caveatKey).toBe('noHourlyIncome');
  });

  it('breakEvenRateMinor solves the rate that zeroes the surplus', () => {
    const stream: IncomeStream = {
      id: 'stream1',
      accountId: 'acc1',
      name: 'Freelance',
      currency: 'USD',
      recurrence: 'recurring',
      confidence: 'confirmed',
      taxable: true,
      startDate: '2026-01-01',
      endDate: null,
      sortOrder: 0,
      archived: false,
      kind: 'hourly',
      hourlyRateMinor: 5000 as Money,
      hoursPerDay: 8,
    };

    // 10 hours worked at 5000/hr = 50000 income; a 20000 outflow leaves a
    // 30000 surplus over a one-day range (monthsInRange < 1, so the "monthly"
    // surplus is scaled up) — breakEvenRate should bring that surplus to
    // zero, i.e. come out below the actual rate.
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 30000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: 30000 as Money,
              convertedMinor: 30000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [
        {
          date: '2026-01-15',
          originalDate: '2026-01-15',
          shifted: false,
          kind: 'income',
          label: 'Freelance',
          sourceId: 'stream1',
          scheduleId: 'sched1',
          occurrenceIndex: 0,
          amountMinor: 50000 as Money,
          currency: 'USD',
          accountId: 'acc1',
          convertedMinor: 50000,
          unconvertible: false,
          recurrence: 'recurring',
          confidence: 'confirmed',
          derivation: 'hourlyDerived',
          coveredPeriod: '2026-01',
          balanceBeforeMinor: -20000,
          balanceAfterMinor: 30000,
        },
        {
          date: '2026-01-15',
          originalDate: '2026-01-15',
          shifted: false,
          kind: 'obligation',
          label: 'Rent',
          sourceId: 'ob1',
          scheduleId: 'sched2',
          occurrenceIndex: 0,
          amountMinor: -20000 as Money,
          currency: 'USD',
          accountId: 'acc1',
          convertedMinor: -20000,
          unconvertible: false,
          recurrence: 'recurring',
          confidence: 'confirmed',
          derivation: 'entered',
          coveredPeriod: null,
          balanceBeforeMinor: 0,
          balanceAfterMinor: -20000,
        },
      ],
      monthPoints: [],
      openingTotalMinor: 0,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const metrics = projectionMetrics(
      projection,
      {
        from: '2026-01-15',
        to: '2026-01-15',
        today: '2026-01-15',
        reportingCurrency: 'USD',
        order: [
          'income',
          'oneOffIn',
          'obligation',
          'dailyExpense',
          'oneOffOut',
        ],
      },
      [stream]
    );

    // 10 hours worked (50000 / 5000). Break-even income = 50000 - surplus*monthsInRange.
    expect(metrics.breakEvenRateMinor.value).not.toBeNull();
    expect(metrics.breakEvenRateMinor.value as number).toBeLessThan(5000);
    expect(metrics.breakEvenRateMinor.caveatKey).toBeNull();
  });
});
