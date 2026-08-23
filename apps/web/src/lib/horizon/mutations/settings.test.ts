import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import {
  updateHorizonReportingCurrency,
  setHorizonEventOrder,
} from './settings';

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

describe('setHorizonEventOrder', () => {
  it('persists a reordered set of kinds', async () => {
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
    const result = await setHorizonEventOrder(client, 'h1', [
      'oneOffIn',
      'income',
      'obligation',
      'dailyExpense',
      'oneOffOut',
    ]);
    expect(result?.eventOrder).toEqual([
      'oneOffIn',
      'income',
      'obligation',
      'dailyExpense',
      'oneOffOut',
    ]);
    expect(db.rows('households')[0].horizon_event_order).toBe(
      'oneOffIn,income,obligation,dailyExpense,oneOffOut'
    );
  });

  it('returns null when the household id does not match', async () => {
    const { client } = fakeSupabase();
    expect(
      await setHorizonEventOrder(client, 'missing', [
        'income',
        'oneOffIn',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ])
    ).toBeNull();
  });
});
