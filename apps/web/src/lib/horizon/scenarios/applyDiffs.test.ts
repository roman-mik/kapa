import { describe, it, expect } from 'vitest';
import type { Money } from '@/lib/types';
import type { ProjectionInputs } from '@/lib/horizon/projection/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import type { Obligation, DailyExpense } from '@/lib/horizon/spending/types';
import { applyScenarioDiffs } from './applyDiffs';
import type { ScenarioDiff, ScenarioOneOff } from './types';

const stream: IncomeStream = {
  id: 'stream1',
  accountId: 'acc1',
  name: 'Freelance',
  currency: 'USD',
  recurrence: 'recurring',
  confidence: 'confirmed',
  taxable: true,
  startDate: '2026-01-01',
  endDate: null,
  sortOrder: 0,
  archived: false,
  kind: 'hourly',
  hourlyRateMinor: 5000 as Money,
  hoursPerDay: 8,
};

const obligation: Obligation = {
  id: 'ob1',
  accountId: 'acc1',
  name: 'Rent',
  category: 'housing',
  amountMinor: 100000 as Money,
  currency: 'USD',
  recurrence: 'recurring',
  confidence: 'confirmed',
  startDate: '2026-01-01',
  endDate: null,
  sortOrder: 0,
  archived: false,
};

const dailyExpense: DailyExpense = {
  id: 'de1',
  accountId: 'acc1',
  pocketCategoryId: null,
  name: 'Groceries',
  dailyAmountMinor: 3300 as Money,
  currency: 'USD',
  chargeCadence: 'daily',
  capMinor: null,
  startDate: '2026-01-01',
  endDate: null,
  archived: false,
};

function baseline(): ProjectionInputs {
  return {
    accounts: [],
    streams: [stream],
    incomeSchedules: [],
    obligations: [obligation],
    obligationSchedules: [],
    dailyExpenses: [dailyExpense],
    oneOffs: [],
    rates: [],
    calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
  };
}

function diff(partial: Partial<ScenarioDiff>): ScenarioDiff {
  return {
    id: 'd1',
    scenarioId: 's1',
    entityType: 'incomeStream',
    entityId: 'stream1',
    field: 'hourlyRateMinor',
    value: 6000,
    effectiveDate: null,
    ...partial,
  };
}

describe('applyScenarioDiffs', () => {
  it('overrides an hourly stream rate without mutating the baseline', () => {
    const inputs = baseline();
    const result = applyScenarioDiffs(inputs, [diff({})], []);

    expect((result.streams[0] as typeof stream).hourlyRateMinor).toBe(6000);
    expect(inputs.streams[0]).toBe(stream); // baseline untouched
  });

  it('toggles an income stream off via the archived field (B5)', () => {
    const inputs = baseline();
    const result = applyScenarioDiffs(
      inputs,
      [
        diff({
          field: 'archived',
          value: true,
        }),
      ],
      []
    );

    expect(result.streams[0].archived).toBe(true);
  });

  it('overrides an obligation amount', () => {
    const inputs = baseline();
    const result = applyScenarioDiffs(
      inputs,
      [
        diff({
          entityType: 'obligation',
          entityId: 'ob1',
          field: 'amountMinor',
          value: 150000,
        }),
      ],
      []
    );

    expect(result.obligations[0].amountMinor).toBe(150000);
  });

  it('overrides a daily expense cap', () => {
    const inputs = baseline();
    const result = applyScenarioDiffs(
      inputs,
      [
        diff({
          entityType: 'dailyExpense',
          entityId: 'de1',
          field: 'capMinor',
          value: 100000,
        }),
      ],
      []
    );

    expect(result.dailyExpenses[0].capMinor).toBe(100000);
  });

  it('skips a diff targeting an entity that no longer exists', () => {
    const inputs = baseline();
    const result = applyScenarioDiffs(
      inputs,
      [diff({ entityId: 'does-not-exist' })],
      []
    );

    expect(
      result.streams[0].kind === 'hourly' && result.streams[0].hourlyRateMinor
    ).toBe(5000);
  });

  it('ignores a field diff that does not apply to the stream kind', () => {
    const inputs = baseline();
    // fixedAmountMinor has no effect on an hourly stream
    const result = applyScenarioDiffs(
      inputs,
      [diff({ field: 'fixedAmountMinor', value: 9999 })],
      []
    );

    expect(result.streams[0]).toEqual(stream);
  });

  it('appends scenario-scoped one-off events', () => {
    const inputs = baseline();
    const oneOff: ScenarioOneOff = {
      id: 'oo1',
      scenarioId: 's1',
      accountId: 'acc1',
      name: 'Moving deposit',
      category: 'housing',
      amountMinor: 50000 as Money,
      currency: 'USD',
      date: '2026-03-01',
      direction: 'out',
    };
    const result = applyScenarioDiffs(inputs, [], [oneOff]);

    expect(result.oneOffs).toHaveLength(1);
    expect(result.oneOffs[0].name).toBe('Moving deposit');
    expect(inputs.oneOffs).toHaveLength(0); // baseline untouched
  });
});
