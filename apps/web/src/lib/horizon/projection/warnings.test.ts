import { describe, it, expect } from 'vitest';
import type { Projection } from './types';
import type { Money } from '@/lib/types';
import { negativeDays, suggestFixes, applyDismissals } from './warnings';

describe('negativeDays', () => {
  it('warns when reporting total closes negative', () => {
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

    const days = negativeDays(projection);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-01-16');
    // Both total and account are negative, so trigger is 'both'
    expect(days[0].trigger).toBe('both');
    expect(days[0].shortfallMinor).toBe(10000);
  });

  it('warns when an includeInTotal account closes negative (account trigger)', () => {
    // Total is positive but personal account went negative scenario
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 200000,
          accounts: [
            {
              accountId: 'personal',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
            {
              accountId: 'business',
              balanceMinor: 100000 as Money,
              convertedMinor: 100000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
        {
          date: '2026-01-16',
          totalMinor: 75400,
          accounts: [
            {
              accountId: 'personal',
              balanceMinor: -124600 as Money,
              convertedMinor: -124600,
              includeInTotal: true,
              currency: 'USD',
            },
            {
              accountId: 'business',
              balanceMinor: 200000 as Money,
              convertedMinor: 200000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [],
      monthPoints: [],
      openingTotalMinor: 200000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const days = negativeDays(projection);
    expect(days).toHaveLength(1);
    expect(days[0].trigger).toBe('account'); // Only personal account negative
    expect(days[0].negativeAccountIds).toContain('personal');
    expect(days[0].shortfallMinor).toBe(124600);
  });

  it('does not warn on non-includeInTotal accounts', () => {
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
            {
              accountId: 'acc2',
              balanceMinor: -50000 as Money,
              convertedMinor: -50000,
              includeInTotal: false,
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

    const days = negativeDays(projection);
    expect(days).toHaveLength(0);
  });

  it('does not fire account trigger for accounts with negative opening balance', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: -50000 as Money,
              convertedMinor: -50000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
        {
          date: '2026-01-16',
          totalMinor: 100000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: -60000 as Money,
              convertedMinor: -60000,
              includeInTotal: true,
              currency: 'USD',
            },
          ],
        },
      ],
      events: [],
      monthPoints: [],
      openingTotalMinor: -50000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const days = negativeDays(projection);
    // No warnings, because opening balance was already negative
    expect(days).toHaveLength(0);
  });

  it('detects both total and account triggers', () => {
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
          totalMinor: -50000,
          accounts: [
            {
              accountId: 'acc1',
              balanceMinor: -50000 as Money,
              convertedMinor: -50000,
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

    const days = negativeDays(projection);
    expect(days[0].trigger).toBe('both');
    expect(days[0].negativeAccountIds).toContain('acc1');
  });
});

describe('suggestFixes', () => {
  it('always emits holdBack', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
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
      openingTotalMinor: -10000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const suggestions = suggestFixes(projection, '2026-01-15', {
      shiftWindowDays: 3,
    });
    const holdBack = suggestions.find((s) => s.kind === 'holdBack');
    expect(holdBack).toBeDefined();
    expect(holdBack?.amountMinor).toBe(10000);
  });

  it('holdBack has null from when no preceding inflow exists', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
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
      openingTotalMinor: -10000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const suggestions = suggestFixes(projection, '2026-01-15', {
      shiftWindowDays: 3,
    });
    const holdBack = suggestions.find((s) => s.kind === 'holdBack');
    expect(holdBack?.from).toBeNull();
  });

  it('each suggestion has a deterministic id', () => {
    const projection: Projection = {
      dailyBalances: [
        {
          date: '2026-01-15',
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
      openingTotalMinor: -10000,
      hasMissingRate: false,
      missingRates: [],
      oldestRateAsOfDate: null,
    };

    const suggestions1 = suggestFixes(projection, '2026-01-15', {
      shiftWindowDays: 3,
    });
    const suggestions2 = suggestFixes(projection, '2026-01-15', {
      shiftWindowDays: 3,
    });

    expect(suggestions1.map((s) => s.id)).toEqual(
      suggestions2.map((s) => s.id)
    );
  });
});

describe('applyDismissals', () => {
  it('flags dismissed days', () => {
    const days = [
      {
        date: '2026-01-15',
        shortfallMinor: 10000,
        shortfallCurrency: 'USD' as const,
        trigger: 'total' as const,
        negativeAccountIds: [],
        suggestions: [],
      },
    ];

    const dismissals = [
      {
        id: 'dim1',
        negativeDate: '2026-01-15',
        shortfallMinor: 10000 as Money,
        currency: 'USD' as const,
        reason: 'Will fix tomorrow',
        createdAt: '2026-01-15T12:00:00Z',
      },
    ];

    const result = applyDismissals(days, dismissals, 'USD');
    expect(result[0].dismissed).toBe(true);
    expect(result[0].dismissedReason).toBe('Will fix tomorrow');
  });

  it('re-surfaces a worsening shortfall', () => {
    const days = [
      {
        date: '2026-01-15',
        shortfallMinor: 50000,
        shortfallCurrency: 'USD' as const,
        trigger: 'total' as const,
        negativeAccountIds: [],
        suggestions: [],
      },
    ];

    const dismissals = [
      {
        id: 'dim1',
        negativeDate: '2026-01-15',
        shortfallMinor: 10000 as Money, // Previously dismissed at 10k
        currency: 'USD' as const,
        reason: 'Will fix tomorrow',
        createdAt: '2026-01-15T12:00:00Z',
      },
    ];

    const result = applyDismissals(days, dismissals, 'USD');
    expect(result[0].dismissed).toBe(false); // Re-surfaces because shortfall worsened
  });

  it('re-surfaces when currency changes', () => {
    const days = [
      {
        date: '2026-01-15',
        shortfallMinor: 10000,
        shortfallCurrency: 'EUR' as const,
        trigger: 'total' as const,
        negativeAccountIds: [],
        suggestions: [],
      },
    ];

    const dismissals = [
      {
        id: 'dim1',
        negativeDate: '2026-01-15',
        shortfallMinor: 10000 as Money,
        currency: 'USD' as const, // Different currency
        reason: 'Will fix tomorrow',
        createdAt: '2026-01-15T12:00:00Z',
      },
    ];

    const result = applyDismissals(days, dismissals, 'EUR');
    expect(result[0].dismissed).toBe(false); // Re-surfaces because currency changed
  });
});
