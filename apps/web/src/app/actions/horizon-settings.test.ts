import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/dal', () => ({
  verifySession: vi.fn(),
  getHouseholdId: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { verifySession, getHouseholdId } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { setHorizonReportingCurrency, setEventOrder } from './horizon-settings';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setHorizonReportingCurrency', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await setHorizonReportingCurrency({ reportingCurrency: 'EUR' })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects an unsupported currency', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setHorizonReportingCurrency({
      reportingCurrency: 'XYZ',
    });
    expect(result.ok).toBe(false);
  });

  it('updates the currency on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);
    mockedCreateClient.mockResolvedValue(client);
    expect(
      await setHorizonReportingCurrency({ reportingCurrency: 'EUR' })
    ).toEqual({ ok: true });
  });
});

describe('setEventOrder', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await setEventOrder({
        eventOrder: [
          'income',
          'oneOffIn',
          'obligation',
          'dailyExpense',
          'oneOffOut',
        ],
      })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects an order with a duplicated kind', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setEventOrder({
      eventOrder: [
        'income',
        'income',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects an order with fewer than 5 kinds', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setEventOrder({
      eventOrder: ['income', 'oneOffIn', 'obligation'],
    });
    expect(result.ok).toBe(false);
  });

  it('persists a reordered set on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
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
    mockedCreateClient.mockResolvedValue(client);

    const result = await setEventOrder({
      eventOrder: [
        'oneOffIn',
        'income',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(db.rows('households')[0].horizon_event_order).toBe(
      'oneOffIn,income,obligation,dailyExpense,oneOffOut'
    );
  });
});
