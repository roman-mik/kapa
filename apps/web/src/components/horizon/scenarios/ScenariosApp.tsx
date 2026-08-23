'use client';

/**
 * E2 (list + editor) and E3 (compare, up to 4 including baseline) share one
 * client tree so the checkbox selection and the live comparison recompute
 * without a server round trip — `compareScenarios` is pure and safe to run
 * in the browser, same discipline as `TimelineClient`'s E1 what-ifs.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ProjectionInputs,
  ProjectionOptions,
} from '@/lib/horizon/projection/types';
import type {
  Scenario,
  ScenarioDiff,
  ScenarioOneOff,
} from '@/lib/horizon/scenarios/types';
import { compareScenarios } from '@/lib/horizon/scenarios/compareScenarios';
import { ScenarioList } from './ScenarioList';
import { ScenarioEditor } from './ScenarioEditor';
import { ComparisonTable } from './ComparisonTable';
import { OverlaidBalanceChart } from './OverlaidBalanceChart';
import { OverlaidMonthPairChart } from './OverlaidMonthPairChart';

const MAX_COMPARE = 4;

export function ScenariosApp({
  scenarios,
  diffsByScenario,
  oneOffsByScenario,
  inputs,
  options,
}: {
  scenarios: Scenario[];
  diffsByScenario: Record<string, ScenarioDiff[]>;
  oneOffsByScenario: Record<string, ScenarioOneOff[]>;
  inputs: ProjectionInputs;
  options: ProjectionOptions;
}) {
  const t = useTranslations('Horizon.scenarios');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<(string | null)[]>([null]);

  const selectedScenario = scenarios.find((s) => s.id === selectedId) ?? null;

  function toggleCompare(id: string | null) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }

  const results = useMemo(() => {
    const selection = compareIds.map((id) => ({
      scenario:
        id === null ? null : (scenarios.find((s) => s.id === id) ?? null),
      diffs: id === null ? [] : (diffsByScenario[id] ?? []),
      oneOffs: id === null ? [] : (oneOffsByScenario[id] ?? []),
    }));
    return compareScenarios(inputs, options, selection);
  }, [
    compareIds,
    scenarios,
    diffsByScenario,
    oneOffsByScenario,
    inputs,
    options,
  ]);

  return (
    <div className="space-y-6">
      <ScenarioList
        scenarios={scenarios}
        selectedId={selectedId}
        onSelect={setSelectedId}
        compareIds={compareIds}
        onToggleCompare={toggleCompare}
      />

      {selectedScenario && (
        <ScenarioEditor
          scenario={selectedScenario}
          diffs={diffsByScenario[selectedScenario.id] ?? []}
          inputs={inputs}
        />
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">{t('compareTitle')}</h2>
        <p className="text-xs text-ink-muted">{t('compareSelect')}</p>

        {results.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('compareEmpty')}</p>
        ) : (
          <>
            <div className="rounded bg-white p-4 shadow overflow-x-auto">
              <ComparisonTable
                results={results}
                reportingCurrency={options.reportingCurrency}
              />
            </div>
            <div className="rounded bg-white p-4 shadow">
              <OverlaidBalanceChart
                results={results}
                reportingCurrency={options.reportingCurrency}
              />
            </div>
            <div className="rounded bg-white p-4 shadow">
              <OverlaidMonthPairChart
                results={results}
                reportingCurrency={options.reportingCurrency}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
