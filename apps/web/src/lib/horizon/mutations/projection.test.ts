import { describe, it, expect } from 'vitest';
import { fakeSupabase } from '@/test/fake-supabase';
import { dismissNegativeDay, undismissNegativeDay } from './projection';
import { getProjectionDismissals } from '../queries/projection';

describe('dismissNegativeDay', () => {
  it('inserts a new dismissal', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);

    const result = await dismissNegativeDay(
      client,
      'h1',
      {
        negativeDate: '2026-01-15',
        shortfallMinor: 50000,
        currency: 'RSD',
        reason: 'Planned expense',
      },
      '2026-01-10'
    );

    expect(result).toBeDefined();
    expect(result?.negativeDate).toBe('2026-01-15');
    expect(result?.shortfallMinor).toBe(50000);
    expect(result?.reason).toBe('Planned expense');

    const dismissals = await getProjectionDismissals(client, 'h1');
    expect(dismissals).toHaveLength(1);
  });

  it('upserts on (household_id, negative_date)', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);

    // First insert
    await dismissNegativeDay(
      client,
      'h1',
      {
        negativeDate: '2026-02-01',
        shortfallMinor: 100000,
        currency: 'RSD',
        reason: 'Original reason',
      },
      '2026-01-15'
    );

    // Upsert on the same date
    const updated = await dismissNegativeDay(
      client,
      'h1',
      {
        negativeDate: '2026-02-01',
        shortfallMinor: 150000,
        currency: 'EUR',
        reason: 'Updated reason',
      },
      '2026-01-15'
    );

    expect(updated?.shortfallMinor).toBe(150000);
    expect(updated?.currency).toBe('EUR');
    expect(updated?.reason).toBe('Updated reason');

    // Should not create a duplicate
    const dismissals = await getProjectionDismissals(client, 'h1');
    expect(
      dismissals.filter((d) => d.negativeDate === '2026-02-01')
    ).toHaveLength(1);
  });

  it('cleans up old dismissals', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);

    // Insert an old dismissal
    db.seed('horizon_projection_dismissals', [
      {
        id: 'old1',
        household_id: 'h1',
        negative_date: '2025-12-01',
        shortfall_minor: 50000,
        currency: 'RSD',
        reason: 'Old dismissal',
      },
    ]);

    // Add a new dismissal with today as 2026-01-10
    await dismissNegativeDay(
      client,
      'h1',
      {
        negativeDate: '2026-01-15',
        shortfallMinor: 50000,
        currency: 'RSD',
        reason: 'New dismissal',
      },
      '2026-01-10'
    );

    // The old dismissal should be deleted, new one should exist
    const dismissals = await getProjectionDismissals(client, 'h1');
    expect(dismissals).toHaveLength(1);
    expect(dismissals[0].negativeDate).toBe('2026-01-15');
  });
});

describe('undismissNegativeDay', () => {
  it('removes a dismissal', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);
    db.seed('horizon_projection_dismissals', [
      {
        id: 'dismiss1',
        household_id: 'h1',
        negative_date: '2026-01-15',
        shortfall_minor: 50000,
        currency: 'RSD',
        reason: 'To be removed',
      },
    ]);

    const result = await undismissNegativeDay(client, 'h1', '2026-01-15');

    expect(result).toBe(true);
    const remaining = await getProjectionDismissals(client, 'h1');
    expect(remaining).toHaveLength(0);
  });

  it('succeeds even if no dismissal exists', async () => {
    const { client, db } = fakeSupabase();
    db.seed('households', [
      { id: 'h1', currency: 'RSD', horizon_reporting_currency: 'RSD' },
    ]);

    const result = await undismissNegativeDay(client, 'h1', '2026-01-15');

    expect(result).toBe(true);
  });
});
