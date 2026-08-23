/**
 * Horizon projection dismissals and event order constraint behavior against
 * real Postgres — the check constraints and FK cascade a mock DB can't surface.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  admin,
  makeUser,
  destroyUser,
  type TestUser,
} from '@/test/setup-integration';
import {
  dismissNegativeDay,
  undismissNegativeDay,
} from '@/lib/horizon/mutations/projection';
import { getProjectionDismissals } from '@/lib/horizon/queries/projection';
import { getHorizonSettings } from '@/lib/horizon/queries/settings';

let alice: TestUser;

beforeAll(async () => {
  alice = await makeUser('horizon-projection-alice');
});

afterAll(async () => {
  await destroyUser(alice);
});

describe('horizon_projection_dismissals check constraints', () => {
  it('rejects an unsupported currency', async () => {
    await expect(
      dismissNegativeDay(
        alice.client,
        alice.householdId,
        {
          negativeDate: '2026-01-15',
          shortfallMinor: 50000,
          currency: 'GBP' as never,
          reason: 'Planned expense',
        },
        '2026-01-10'
      )
    ).rejects.toThrow();
  });

  it('rejects a zero shortfall', async () => {
    await expect(
      dismissNegativeDay(
        alice.client,
        alice.householdId,
        {
          negativeDate: '2026-01-15',
          shortfallMinor: 0,
          currency: 'RSD',
          reason: 'Planned expense',
        },
        '2026-01-10'
      )
    ).rejects.toThrow();
  });

  it('rejects a negative shortfall', async () => {
    await expect(
      dismissNegativeDay(
        alice.client,
        alice.householdId,
        {
          negativeDate: '2026-01-15',
          shortfallMinor: -50000,
          currency: 'RSD',
          reason: 'Planned expense',
        },
        '2026-01-10'
      )
    ).rejects.toThrow();
  });

  it('rejects a blank reason', async () => {
    await expect(
      dismissNegativeDay(
        alice.client,
        alice.householdId,
        {
          negativeDate: '2026-01-15',
          shortfallMinor: 50000,
          currency: 'RSD',
          reason: '   ',
        },
        '2026-01-10'
      )
    ).rejects.toThrow();
  });

  it('rejects a reason longer than 500 characters', async () => {
    await expect(
      dismissNegativeDay(
        alice.client,
        alice.householdId,
        {
          negativeDate: '2026-01-15',
          shortfallMinor: 50000,
          currency: 'RSD',
          reason: 'x'.repeat(501),
        },
        '2026-01-10'
      )
    ).rejects.toThrow();
  });

  it('allows a valid dismissal', async () => {
    const dismissal = await dismissNegativeDay(
      alice.client,
      alice.householdId,
      {
        negativeDate: '2026-01-15',
        shortfallMinor: 50000,
        currency: 'RSD',
        reason: 'Planned expense',
      },
      '2026-01-10'
    );
    expect(dismissal).toBeDefined();
    expect(dismissal?.negativeDate).toBe('2026-01-15');
    expect(dismissal?.reason).toBe('Planned expense');
  });
});

describe('horizon_projection_dismissals upsert behavior', () => {
  it('upserts on (household_id, negative_date) — replaces on duplicate', async () => {
    // First insert
    await dismissNegativeDay(
      alice.client,
      alice.householdId,
      {
        negativeDate: '2026-02-01',
        shortfallMinor: 100000,
        currency: 'RSD',
        reason: 'Original reason',
      },
      '2026-01-15'
    );

    const afterFirst = await getProjectionDismissals(
      alice.client,
      alice.householdId
    );
    expect(
      afterFirst.filter((d) => d.negativeDate === '2026-02-01')
    ).toHaveLength(1);

    // Upsert on the same date
    await dismissNegativeDay(
      alice.client,
      alice.householdId,
      {
        negativeDate: '2026-02-01',
        shortfallMinor: 150000,
        currency: 'EUR',
        reason: 'Updated reason',
      },
      '2026-01-15'
    );

    const afterSecond = await getProjectionDismissals(
      alice.client,
      alice.householdId
    );
    const updated = afterSecond.find((d) => d.negativeDate === '2026-02-01');
    expect(
      afterSecond.filter((d) => d.negativeDate === '2026-02-01')
    ).toHaveLength(1);
    expect(updated?.shortfallMinor).toBe(150000);
    expect(updated?.currency).toBe('EUR');
    expect(updated?.reason).toBe('Updated reason');
  });
});

describe('horizon_event_order permutation check constraint', () => {
  it('rejects an event order with duplicate kinds', async () => {
    const { error } = await alice.client
      .from('households')
      .update({
        horizon_event_order: 'income,income,obligation,dailyExpense,oneOffOut',
      })
      .eq('id', alice.householdId);

    expect(error).toBeDefined();
    expect(error?.code).toBe('23514'); // check constraint violation
  });

  it('rejects an event order with too few kinds', async () => {
    const { error } = await alice.client
      .from('households')
      .update({
        horizon_event_order: 'income,obligation,dailyExpense,oneOffOut',
      })
      .eq('id', alice.householdId);

    expect(error).toBeDefined();
    expect(error?.code).toBe('23514');
  });

  it('rejects an event order with too many kinds', async () => {
    const { error } = await alice.client
      .from('households')
      .update({
        horizon_event_order:
          'income,oneOffIn,obligation,dailyExpense,oneOffOut,extra',
      })
      .eq('id', alice.householdId);

    expect(error).toBeDefined();
    expect(error?.code).toBe('23514');
  });

  it('allows a valid permutation of the event order', async () => {
    const { error } = await alice.client
      .from('households')
      .update({
        horizon_event_order:
          'obligation,income,oneOffOut,dailyExpense,oneOffIn',
      })
      .eq('id', alice.householdId);

    expect(error).toBeNull();

    const settings = await getHorizonSettings(alice.client, alice.householdId);
    expect(settings.eventOrder).toEqual([
      'obligation',
      'income',
      'oneOffOut',
      'dailyExpense',
      'oneOffIn',
    ]);
  });
});

describe('households.on delete cascade for dismissals', () => {
  it('deleting the household deletes its projection dismissals', async () => {
    const bob = await makeUser('horizon-projection-cascade-bob');

    // Insert a dismissal
    await dismissNegativeDay(
      bob.client,
      bob.householdId,
      {
        negativeDate: '2026-03-01',
        shortfallMinor: 75000,
        currency: 'EUR',
        reason: 'Test dismissal',
      },
      '2026-02-15'
    );

    const beforeDelete = await getProjectionDismissals(
      bob.client,
      bob.householdId
    );
    expect(beforeDelete.length).toBeGreaterThan(0);

    // Delete the household via service_role
    const { error } = await admin
      .from('households')
      .delete()
      .eq('id', bob.householdId);
    expect(error).toBeNull();

    // Check dismissals are gone
    const afterDelete = await getProjectionDismissals(admin, bob.householdId);
    expect(afterDelete).toEqual([]);

    await destroyUser(bob);
  });
});

describe('undismiss behavior', () => {
  it('removes a dismissal by (household_id, negative_date)', async () => {
    const dismissal = await dismissNegativeDay(
      alice.client,
      alice.householdId,
      {
        negativeDate: '2026-04-01',
        shortfallMinor: 60000,
        currency: 'RSD',
        reason: 'To be undismissed',
      },
      '2026-03-15'
    );

    expect(dismissal).toBeDefined();

    await undismissNegativeDay(alice.client, alice.householdId, '2026-04-01');

    const remaining = await getProjectionDismissals(
      alice.client,
      alice.householdId
    );
    expect(
      remaining.filter((d) => d.negativeDate === '2026-04-01')
    ).toHaveLength(0);
  });
});
