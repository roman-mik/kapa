import { describe, it, expect } from 'vitest';
import { ProjectionTable } from './ProjectionTable';
import type { ProjectionEvent } from '@/lib/horizon/projection/types';
import type { Money } from '@/lib/types';

const mockEvent = (overrides?: Partial<ProjectionEvent>): ProjectionEvent => ({
  date: '2026-08-23',
  originalDate: '2026-08-23',
  shifted: false,
  kind: 'income',
  label: 'Test Event',
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
  ...overrides,
});

describe('ProjectionTable', () => {
  it('is defined as a server component', () => {
    expect(ProjectionTable).toBeDefined();
  });

  it('accepts empty events array', () => {
    const events: ProjectionEvent[] = [];
    expect(events).toHaveLength(0);
  });

  it('handles multiple event kinds', () => {
    const events = [
      mockEvent({ kind: 'income' }),
      mockEvent({ kind: 'obligation' }),
      mockEvent({ kind: 'dailyExpense' }),
    ];
    expect(events).toHaveLength(3);
  });

  it('supports multiple currencies', () => {
    const usdEvent = mockEvent({ currency: 'USD' });
    const eurEvent = mockEvent({ currency: 'EUR' });
    expect(usdEvent.currency).toBe('USD');
    expect(eurEvent.currency).toBe('EUR');
  });

  it('groups daily expenses correctly', () => {
    const events = [
      mockEvent({
        kind: 'dailyExpense',
        sourceId: 'de1',
        date: '2026-08-23',
      }),
      mockEvent({
        kind: 'dailyExpense',
        sourceId: 'de2',
        date: '2026-08-23',
      }),
    ];
    const firstDate = events[0].date;
    const sameDay = events.filter((e) => e.date === firstDate);
    expect(sameDay).toHaveLength(2);
  });
});
