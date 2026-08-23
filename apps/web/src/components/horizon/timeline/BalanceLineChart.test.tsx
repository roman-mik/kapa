import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BalanceLineChart } from './BalanceLineChart';
import type {
  DailyBalance,
  ProjectionEvent,
} from '@/lib/horizon/projection/types';
import type { Money } from '@/lib/types';

describe('BalanceLineChart', () => {
  const mockDailyBalances: DailyBalance[] = [
    {
      date: '2026-08-23',
      totalMinor: 100000,
      accounts: [],
    },
    {
      date: '2026-08-24',
      totalMinor: 105000,
      accounts: [],
    },
    {
      date: '2026-08-25',
      totalMinor: 95000,
      accounts: [],
    },
  ];

  const mockEvents: ProjectionEvent[] = [
    {
      date: '2026-08-23',
      originalDate: '2026-08-23',
      shifted: false,
      kind: 'income',
      label: 'Salary',
      sourceId: 's1',
      scheduleId: 'sch1',
      occurrenceIndex: 1,
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
  ];

  it('renders an SVG with proper attributes', () => {
    const { container } = render(
      <BalanceLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        reportingCurrency="USD"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBeTruthy();
    expect(svg?.getAttribute('viewBox')).toBeTruthy();
    expect(svg?.getAttribute('width')).toBe('100%');
  });

  it('renders zero line when zero is within the range', () => {
    const balances: DailyBalance[] = [
      { date: '2026-08-23', totalMinor: -10000, accounts: [] },
      { date: '2026-08-24', totalMinor: 10000, accounts: [] },
    ];

    const { container } = render(
      <BalanceLineChart
        dailyBalances={balances}
        events={[]}
        reportingCurrency="USD"
      />
    );

    const dashLines = container.querySelectorAll('line[stroke-dasharray]');
    expect(dashLines.length).toBeGreaterThan(0);
  });

  it('includes event markers for convertible events', () => {
    const { container } = render(
      <BalanceLineChart
        dailyBalances={mockDailyBalances}
        events={mockEvents}
        reportingCurrency="USD"
      />
    );

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);
  });

  it('excludes unconvertible event markers', () => {
    const unconvertibleEvent: ProjectionEvent = {
      ...mockEvents[0],
      unconvertible: true,
    };

    const { container } = render(
      <BalanceLineChart
        dailyBalances={mockDailyBalances}
        events={[unconvertibleEvent]}
        reportingCurrency="USD"
      />
    );

    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(0);
  });

  it('renders null when daily balances are empty', () => {
    const { container } = render(
      <BalanceLineChart
        dailyBalances={[]}
        events={[]}
        reportingCurrency="USD"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('shows warning note when there are negative days', () => {
    const negativeBalances: DailyBalance[] = [
      { date: '2026-08-23', totalMinor: 100000, accounts: [] },
      { date: '2026-08-24', totalMinor: -10000, accounts: [] },
    ];

    const { container } = render(
      <BalanceLineChart
        dailyBalances={negativeBalances}
        events={[]}
        reportingCurrency="USD"
      />
    );

    const text = container.textContent;
    expect(text).toContain('negative days');
  });
});
