import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { getHorizonSettings } from './settings';

describe('getHorizonSettings', () => {
  it('returns the household reporting currency and event order', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      {
        id: 'h1',
        currency: 'RSD',
        horizon_reporting_currency: 'EUR',
        horizon_event_order:
          'obligation,income,oneOffOut,dailyExpense,oneOffIn',
      },
    ]);
    expect(await getHorizonSettings(client, 'h1')).toEqual({
      reportingCurrency: 'EUR',
      eventOrder: [
        'obligation',
        'income',
        'oneOffOut',
        'dailyExpense',
        'oneOffIn',
      ],
    });
  });

  it('falls back to RSD and default event order when the household row is missing', async () => {
    const { client } = fakeSupabase();
    expect(await getHorizonSettings(client, 'missing')).toEqual({
      reportingCurrency: 'RSD',
      eventOrder: [
        'income',
        'oneOffIn',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ],
    });
  });
});
