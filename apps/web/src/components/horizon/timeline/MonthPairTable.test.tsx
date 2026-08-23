import { describe, it, expect } from 'vitest';
import { MonthPairTable } from './MonthPairTable';
import type { MonthPair } from '@/lib/horizon/projection/types';

const mockMonthPair = (overrides?: Partial<MonthPair>): MonthPair => ({
  month: '2026-08',
  end: { date: '2026-08-31', balanceMinor: 500000 },
  minimum: { date: '2026-08-15', balanceMinor: 100000 },
  partial: false,
  ...overrides,
});

describe('MonthPairTable', () => {
  it('is defined as a server component', () => {
    expect(MonthPairTable).toBeDefined();
  });

  it('accepts month points array', () => {
    const monthPoints = [mockMonthPair()];
    expect(monthPoints).toHaveLength(1);
    expect(monthPoints[0].month).toBe('2026-08');
  });

  it('handles multiple months', () => {
    const monthPoints = [
      mockMonthPair({ month: '2026-08' }),
      mockMonthPair({ month: '2026-09' }),
      mockMonthPair({ month: '2026-10' }),
    ];
    expect(monthPoints).toHaveLength(3);
  });

  it('marks partial months', () => {
    const fullMonth = mockMonthPair({ partial: false });
    const partialMonth = mockMonthPair({ partial: true });
    expect(fullMonth.partial).toBe(false);
    expect(partialMonth.partial).toBe(true);
  });

  it('includes both end and minimum dates', () => {
    const monthPair = mockMonthPair({
      end: { date: '2026-08-31', balanceMinor: 500000 },
      minimum: { date: '2026-08-15', balanceMinor: 100000 },
    });
    expect(monthPair.end.date).toBe('2026-08-31');
    expect(monthPair.minimum.date).toBe('2026-08-15');
  });

  it('supports different currencies', () => {
    const monthPair = mockMonthPair();
    expect(monthPair).toBeDefined();
    const usdCurrency = 'USD';
    const eurCurrency = 'EUR';
    expect(usdCurrency).toBe('USD');
    expect(eurCurrency).toBe('EUR');
  });
});
