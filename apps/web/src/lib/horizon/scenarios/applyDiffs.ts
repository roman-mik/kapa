/**
 * The one new engine piece for Epic E: apply a scenario's diffs to a baseline
 * `ProjectionInputs` bundle and hand the result to the unmodified
 * `projectCashflow`. Pure, no I/O — mirrors `projectCashflow`'s own
 * discipline (§7): same inputs, same output, every time.
 *
 * An unknown `entityId` (the entity was deleted after the diff was saved) is
 * skipped, not thrown — a total function, consistent with the rest of the
 * projection engine's defensiveness (§2-D14/G1: silent data loss is worse
 * than a stale diff quietly doing nothing).
 */
import type { ProjectionInputs } from '@/lib/horizon/projection/types';
import type { IncomeStream } from '@/lib/horizon/income/types';
import type { Obligation, DailyExpense } from '@/lib/horizon/spending/types';
import type { Money } from '@/lib/types';
import type { ScenarioDiff, ScenarioOneOff } from './types';

function applyIncomeStreamDiff(
  stream: IncomeStream,
  field: string,
  value: number | boolean
): IncomeStream {
  switch (field) {
    case 'archived':
      return { ...stream, archived: value as boolean };
    case 'hourlyRateMinor':
      return stream.kind === 'hourly'
        ? { ...stream, hourlyRateMinor: value as Money }
        : stream;
    case 'hoursPerDay':
      return stream.kind === 'hourly'
        ? { ...stream, hoursPerDay: value as number }
        : stream;
    case 'fixedAmountMinor':
      return stream.kind !== 'hourly'
        ? { ...stream, fixedAmountMinor: value as Money }
        : stream;
    default:
      return stream;
  }
}

function applyObligationDiff(
  obligation: Obligation,
  field: string,
  value: number | boolean
): Obligation {
  switch (field) {
    case 'archived':
      return { ...obligation, archived: value as boolean };
    case 'amountMinor':
      return { ...obligation, amountMinor: value as Money };
    default:
      return obligation;
  }
}

function applyDailyExpenseDiff(
  expense: DailyExpense,
  field: string,
  value: number | boolean
): DailyExpense {
  switch (field) {
    case 'archived':
      return { ...expense, archived: value as boolean };
    case 'dailyAmountMinor':
      return { ...expense, dailyAmountMinor: value as Money };
    case 'capMinor':
      return { ...expense, capMinor: value as Money };
    default:
      return expense;
  }
}

export function applyScenarioDiffs(
  baseline: ProjectionInputs,
  diffs: readonly ScenarioDiff[],
  oneOffs: readonly ScenarioOneOff[]
): ProjectionInputs {
  let streams = baseline.streams;
  let obligations = baseline.obligations;
  let dailyExpenses = baseline.dailyExpenses;

  for (const diff of diffs) {
    if (diff.entityType === 'incomeStream') {
      const idx = streams.findIndex((s) => s.id === diff.entityId);
      if (idx === -1) continue;
      if (streams === baseline.streams) streams = [...streams];
      streams[idx] = applyIncomeStreamDiff(streams[idx], diff.field, diff.value);
    } else if (diff.entityType === 'obligation') {
      const idx = obligations.findIndex((o) => o.id === diff.entityId);
      if (idx === -1) continue;
      if (obligations === baseline.obligations) obligations = [...obligations];
      obligations[idx] = applyObligationDiff(
        obligations[idx],
        diff.field,
        diff.value
      );
    } else if (diff.entityType === 'dailyExpense') {
      const idx = dailyExpenses.findIndex((e) => e.id === diff.entityId);
      if (idx === -1) continue;
      if (dailyExpenses === baseline.dailyExpenses)
        dailyExpenses = [...dailyExpenses];
      dailyExpenses[idx] = applyDailyExpenseDiff(
        dailyExpenses[idx],
        diff.field,
        diff.value
      );
    }
  }

  const scenarioOneOffs = oneOffs.map((o) => ({
    id: o.id,
    accountId: o.accountId,
    name: o.name,
    category: o.category,
    amountMinor: o.amountMinor,
    currency: o.currency,
    date: o.date,
    direction: o.direction,
  }));

  return {
    ...baseline,
    streams,
    obligations,
    dailyExpenses,
    oneOffs:
      scenarioOneOffs.length > 0
        ? [...baseline.oneOffs, ...scenarioOneOffs]
        : baseline.oneOffs,
  };
}
