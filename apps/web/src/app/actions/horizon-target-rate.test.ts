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
import { setHorizonTaxSettings } from './horizon-target-rate';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setHorizonTaxSettings', () => {
  it('rejects when signed out', async () => {
    expect(
      await setHorizonTaxSettings({
        fixedMonthlyMinor: 10000,
        marginalRateBps: 1000,
      })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects a marginal rate of 100% or more', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setHorizonTaxSettings({
      fixedMonthlyMinor: 10000,
      marginalRateBps: 10000,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a negative fixed amount', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await setHorizonTaxSettings({
      fixedMonthlyMinor: -1,
      marginalRateBps: 1000,
    });
    expect(result.ok).toBe(false);
  });

  it('persists the tax policy on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client, db } = fakeSupabase();
    db.seed('households', [
      {
        id: 'h1',
        currency: 'RSD',
        horizon_tax_fixed_monthly_minor: null,
        horizon_tax_marginal_rate_bps: null,
      },
    ]);
    mockedCreateClient.mockResolvedValue(client);

    const result = await setHorizonTaxSettings({
      fixedMonthlyMinor: 10000,
      marginalRateBps: 1000,
    });

    expect(result).toEqual({ ok: true });
    expect(db.rows('households')[0].horizon_tax_fixed_monthly_minor).toBe(
      10000
    );
    expect(db.rows('households')[0].horizon_tax_marginal_rate_bps).toBe(1000);
  });
});
