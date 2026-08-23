/**
 * E3: run the projection once per scenario (plus the baseline, which is the
 * bundle with zero diffs applied) and collect the pieces the comparison view
 * needs. Pure — reuses `applyScenarioDiffs`, `projectCashflow` and
 * `projectionMetrics` unchanged, one call per scenario.
 */
import { projectCashflow } from '@/lib/horizon/projection/projection';
import { projectionMetrics } from '@/lib/horizon/projection/metrics';
import type {
  ProjectionInputs,
  ProjectionOptions,
  ProjectionMetrics,
  MonthPair,
  DailyBalance,
} from '@/lib/horizon/projection/types';
import { applyScenarioDiffs } from './applyDiffs';
import type { Scenario, ScenarioDiff, ScenarioOneOff } from './types';

export interface ScenarioComparisonInput {
  scenario: Scenario | null; // null = baseline
  diffs: ScenarioDiff[];
  oneOffs: ScenarioOneOff[];
}

export interface ScenarioResult {
  scenarioId: string | null; // null = baseline
  scenarioName: string;
  monthPoints: MonthPair[];
  dailyBalances: DailyBalance[];
  metrics: ProjectionMetrics;
}

/** Capped at 4 by the caller (the UI enforces the selection limit); this
 *  function itself has no cap so it stays a total function over its input. */
export function compareScenarios(
  baseline: ProjectionInputs,
  options: ProjectionOptions,
  scenarios: readonly ScenarioComparisonInput[]
): ScenarioResult[] {
  return scenarios.map(({ scenario, diffs, oneOffs }) => {
    const inputs =
      scenario === null
        ? baseline
        : applyScenarioDiffs(baseline, diffs, oneOffs);
    const projection = projectCashflow(inputs, options);
    const metrics = projectionMetrics(projection, options, inputs.streams);

    return {
      scenarioId: scenario?.id ?? null,
      scenarioName: scenario?.name ?? 'baseline',
      monthPoints: projection.monthPoints,
      dailyBalances: projection.dailyBalances,
      metrics,
    };
  });
}
