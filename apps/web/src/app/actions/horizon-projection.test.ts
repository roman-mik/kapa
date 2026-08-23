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
import {
  dismissNegativeDayAction,
  undismissNegativeDayAction,
} from './horizon-projection';

const mockedVerifySession = vi.mocked(verifySession);
const mockedGetHouseholdId = vi.mocked(getHouseholdId);
const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dismissNegativeDayAction', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(
      await dismissNegativeDayAction({
        negativeDate: '2026-01-01',
        shortfallMinor: 100,
        currency: 'EUR',
        reason: 'Expected',
      })
    ).toEqual({ ok: false, error: 'Not signed in.' });
  });

  it('rejects an empty reason before touching the DB', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    const result = await dismissNegativeDayAction({
      negativeDate: '2026-01-01',
      shortfallMinor: 100,
      currency: 'EUR',
      reason: '   ',
    });
    expect(result.ok).toBe(false);
    expect(mockedGetHouseholdId).not.toHaveBeenCalled();
  });

  it('dismisses on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);

    const result = await dismissNegativeDayAction({
      negativeDate: '2026-01-01',
      shortfallMinor: 100,
      currency: 'EUR',
      reason: 'Expected shortfall',
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('undismissNegativeDayAction', () => {
  it('rejects when signed out', async () => {
    mockedVerifySession.mockResolvedValue(null);
    expect(await undismissNegativeDayAction('2026-01-01')).toEqual({
      ok: false,
      error: 'Not signed in.',
    });
  });

  it('undismisses on the happy path', async () => {
    mockedVerifySession.mockResolvedValue({ id: 'u1' });
    mockedGetHouseholdId.mockResolvedValue('h1');
    const { client } = fakeSupabase();
    mockedCreateClient.mockResolvedValue(client);

    const result = await undismissNegativeDayAction('2026-01-01');
    expect(result).toEqual({ ok: true });
  });
});
