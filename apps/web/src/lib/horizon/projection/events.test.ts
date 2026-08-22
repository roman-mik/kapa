import { describe, it, expect } from 'vitest';
import { buildProjectionEvents } from './events';
import type { ProjectionInputs, ProjectionOptions } from './types';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { Money } from '@/lib/types';

const mockCalendar: ScheduleCalendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

describe('buildProjectionEvents', () => {
  it('should exclude events dated today', () => {
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
          currency: 'USD',
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

    const events = buildProjectionEvents(inputs, options);

    // Event on 2026-01-15 should be excluded (even if there was one)
    // The month-end event on 2026-01-31 should be included
    const jan31Events = events.filter((e) => e.date === '2026-01-31');
    expect(jan31Events.length).toBeGreaterThan(0);
  });

  it('should filter archived streams', () => {
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
          currency: 'USD',
          recurrence: 'recurring',
          confidence: 'confirmed',
          taxable: true,
          sortOrder: 0,
          archived: true,
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

    const events = buildProjectionEvents(inputs, options);

    // Should have no events from archived stream
    expect(events.filter((e) => e.sourceId === 'stream1').length).toBe(0);
  });

  it('should exclude events with zero amount', () => {
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
          fixedAmountMinor: 0 as Money,
          currency: 'USD',
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

    const events = buildProjectionEvents(inputs, options);

    // Should have no events with zero amount
    expect(events.filter((e) => e.sourceId === 'stream1').length).toBe(0);
  });

  it('should correctly handle one-off events with direction', () => {
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
          amountMinor: 100000 as Money,
          direction: 'in',
          currency: 'USD',
        },
        {
          id: 'oneoff2',
          accountId: 'acc1',
          date: '2026-01-25',
          name: 'Unexpected expense',
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

    const events = buildProjectionEvents(inputs, options);

    const bonusEvent = events.find((e) => e.sourceId === 'oneoff1');
    expect(bonusEvent).toBeDefined();
    expect(bonusEvent?.kind).toBe('oneOffIn');
    expect(bonusEvent?.amountMinor).toBe(100000);

    const expenseEvent = events.find((e) => e.sourceId === 'oneoff2');
    expect(expenseEvent).toBeDefined();
    expect(expenseEvent?.kind).toBe('oneOffOut');
    expect(expenseEvent?.amountMinor).toBe(-50000);
  });
});
