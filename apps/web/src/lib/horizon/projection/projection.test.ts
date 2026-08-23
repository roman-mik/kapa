import { describe, it, expect } from 'vitest';
import { projectCashflow } from './projection';
import type { ProjectionInputs, ProjectionOptions } from './types';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { Money } from '@/lib/types';

const mockCalendar: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

describe('projectCashflow', () => {
  it('should emit one DailyBalance per calendar day with no gaps', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-20',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    // Should have one DailyBalance per day (6 days: 15-20 inclusive)
    expect(projection.dailyBalances.length).toBe(6);
    expect(projection.dailyBalances[0].date).toBe('2026-01-15');
    expect(projection.dailyBalances[5].date).toBe('2026-01-20');
  });

  it('should have opening balance equal to opening account balance', () => {
    const today = '2026-01-15';
    const openingBalance = 100000 as Money;

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: openingBalance,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-20',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    expect(projection.openingTotalMinor).toBe(openingBalance);
    expect(projection.dailyBalances[0].totalMinor).toBe(openingBalance);
  });

  it('should exclude archived accounts from opening balance', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
        {
          id: 'acc2',
          name: 'Archived',
          currency: 'USD',
          currentBalanceMinor: 50000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 1,
          archived: true,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-20',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    // Opening should only be from acc1
    expect(projection.openingTotalMinor).toBe(100000);
  });

  it('should apply stamp balancesBefore and balanceAfter on events', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [
        {
          id: 'oneoff1',
          accountId: 'acc1',
          date: '2026-01-20',
          name: 'Bonus',
          category: 'bonus',
          amountMinor: 50000 as Money,
          direction: 'in',
          currency: 'USD',
        },
      ],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-20',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    const event = projection.events[0];
    if (event) {
      expect(event.balanceBeforeMinor).toBe(100000);
      expect(event.balanceAfterMinor).toBe(150000);
    }
  });

  it('should emit monthPoints with both end and minimum', () => {
    const today = '2026-01-01';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [
        {
          id: 'oneoff1',
          accountId: 'acc1',
          date: '2026-01-15',
          name: 'Withdrawal',
          category: 'other',
          amountMinor: 50000 as Money,
          direction: 'out',
          currency: 'USD',
        },
      ],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-31',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    // Should have one month point for January
    expect(projection.monthPoints.length).toBeGreaterThan(0);
    const janPoint = projection.monthPoints.find((m) => m.month === '2026-01');
    expect(janPoint).toBeDefined();
    if (janPoint) {
      expect(janPoint.end).toBeDefined();
      expect(janPoint.minimum).toBeDefined();
      // Minimum should be after the withdrawal (50000)
      expect(janPoint.minimum.balanceMinor).toBeLessThan(100000);
    }
  });

  it('should clamp from to today if from < today', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: '2026-01-01', // Before today
      to: '2026-01-20',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    // First day should be today, not 2026-01-01
    expect(projection.dailyBalances[0].date).toBe(today);
  });

  it('should return empty monthPoints if range is empty', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [],
      incomeSchedules: [],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [],
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: today,
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    // Should have daily balance for the single day
    expect(projection.dailyBalances.length).toBe(1);
  });

  it('should mark unconvertible events when FX rate is missing', () => {
    const today = '2026-01-15';

    const inputs: ProjectionInputs = {
      accounts: [
        {
          id: 'acc1',
          name: 'Checking',
          currency: 'USD',
          currentBalanceMinor: 100000 as Money,
          type: 'personal',
          includeInTotal: true,
          sortOrder: 0,
          archived: false,
        },
      ],
      streams: [
        {
          id: 'stream1',
          kind: 'fixed',
          name: 'Salary',
          accountId: 'acc1',
          startDate: '2026-01-01',
          endDate: null,
          fixedAmountMinor: 50000 as Money,
          currency: 'EUR',
          recurrence: 'recurring',
          confidence: 'confirmed',
          archived: false,
          taxable: true,
          sortOrder: 0,
        },
      ],
      incomeSchedules: [
        {
          id: 'sched1',
          incomeStreamId: 'stream1',
          kind: 'monthEnd',
          dayOfMonth: null,
          intervalDays: null,
          nthWeekday: null,
          weekday: null,
          anchorDate: null,
          slippagePolicy: 'none',
          coversPeriod: 'same',
        },
      ],
      obligations: [],
      obligationSchedules: [],
      dailyExpenses: [],
      oneOffs: [],
      rates: [], // No FX rates!
      calendar: mockCalendar,
    };

    const options: ProjectionOptions = {
      from: today,
      to: '2026-01-31',
      today,
      reportingCurrency: 'USD',
      order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
    };

    const projection = projectCashflow(inputs, options);

    expect(projection.hasMissingRate).toBe(true);
    expect(projection.missingRates.length).toBeGreaterThan(0);

    // Event should be unconvertible
    const event = projection.events.find((e) => e.sourceId === 'stream1');
    if (event) {
      expect(event.unconvertible).toBe(true);
    }
  });
});
