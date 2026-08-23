import { describe, it, expect } from 'vitest';
import type { Money } from '@/lib/types';
import type {
  ProjectionInputs,
  ProjectionOptions,
} from '@/lib/horizon/projection/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import type {
  Obligation,
  ObligationSchedule,
} from '@/lib/horizon/spending/types';
import type { HorizonAccount } from '@/lib/horizon/types';
import { compareScenarios } from './compareScenarios';
import type { Scenario, ScenarioDiff } from './types';

const account: HorizonAccount = {
  id: 'acc1',
  name: 'Checking',
  currency: 'USD',
  currentBalanceMinor: 100000 as Money,
  type: 'personal',
  includeInTotal: true,
  sortOrder: 0,
  archived: false,
};

const stream: IncomeStream = {
  id: 'stream1',
  accountId: 'acc1',
  name: 'Salary',
  currency: 'USD',
  recurrence: 'recurring',
  confidence: 'confirmed',
  taxable: true,
  startDate: '2026-01-01',
  endDate: null,
  sortOrder: 0,
  archived: false,
  kind: 'fixed',
  fixedAmountMinor: 200000 as Money,
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

const obligationSchedule: ObligationSchedule = {
  id: 'sched1',
  obligationId: 'ob1',
  kind: 'dayOfMonth',
  dayOfMonth: 15,
  intervalDays: null,
  nthWeekday: null,
  weekday: null,
  anchorDate: null,
  slippagePolicy: 'none',
  coversPeriod: 'same',
};

const baseline: ProjectionInputs = {
  accounts: [account],
  streams: [stream],
  incomeSchedules: [],
  obligations: [obligation],
  obligationSchedules: [obligationSchedule],
  dailyExpenses: [],
  oneOffs: [],
  rates: [],
  calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
};

const options: ProjectionOptions = {
  from: '2026-01-01',
  to: '2026-01-31',
  today: '2026-01-01',
  reportingCurrency: 'USD',
  order: ['income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut'],
};

const scenario: Scenario = { id: 's1', name: 'Higher rent', sortOrder: 0 };

const diff: ScenarioDiff = {
  id: 'd1',
  scenarioId: 's1',
  entityType: 'obligation',
  entityId: 'ob1',
  field: 'amountMinor',
  value: 150000,
  effectiveDate: null,
};

describe('compareScenarios', () => {
  it('runs the baseline (no diffs) and a scenario side by side', () => {
    const results = compareScenarios(baseline, options, [
      { scenario: null, diffs: [], oneOffs: [] },
      { scenario, diffs: [diff], oneOffs: [] },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].scenarioId).toBeNull();
    expect(results[1].scenarioId).toBe('s1');

    // The scenario's higher rent should leave a worse (lower) end balance.
    const baselineEnd =
      results[0].dailyBalances[results[0].dailyBalances.length - 1].totalMinor;
    const scenarioEnd =
      results[1].dailyBalances[results[1].dailyBalances.length - 1].totalMinor;
    expect(scenarioEnd).toBeLessThan(baselineEnd);
  });

  it('does not mutate the shared baseline bundle across scenarios', () => {
    compareScenarios(baseline, options, [
      { scenario, diffs: [diff], oneOffs: [] },
    ]);

    expect(baseline.obligations[0].amountMinor).toBe(100000);
  });
});
