import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { updateHorizonReportingCurrency } from './settings';

describe('updateHorizonReportingCurrency', () => {
  it('updates the reporting currency, leaving currency untouched (D15)', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      {
        id: 'h1',
        currency: 'RSD',
        horizon_reporting_currency: 'RSD',
        horizon_event_order:
          'income,oneOffIn,obligation,dailyExpense,oneOffOut',
      },
    ]);
    const result = await updateHorizonReportingCurrency(client, 'h1', {
      reportingCurrency: 'EUR',
    });
    expect(result).toEqual({
      reportingCurrency: 'EUR',
      eventOrder: [
        'income',
        'oneOffIn',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ],
    });
    expect(db.rows('households')[0].currency).toBe('RSD');
  });

  it('returns null when the household id does not match', async () => {
    const { client } = fakeSupabase();
    expect(
      await updateHorizonReportingCurrency(client, 'missing', {
        reportingCurrency: 'EUR',
      })
    ).toBeNull();
  });
});
