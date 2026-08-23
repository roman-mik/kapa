'use client';

/**
 * E1: inline what-if editing. Owns a draft set of scenario-shaped diffs in
 * React state, recomputes `projectCashflow`/`projectionMetrics` in memory on
 * every change (no server round trip — the engine is pure and safe to run in
 * the browser), and renders the headline metrics + chosen chart against
 * either the baseline or the live draft. The month/event tables stay
 * server-rendered against the baseline (see page.tsx) since they're async
 * server components.
 */

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { projectCashflow } from '@/lib/horizon/projection/projection';
import { projectionMetrics } from '@/lib/horizon/projection/metrics';
import { applyScenarioDiffs } from '@/lib/horizon/scenarios/applyDiffs';
import type {
  ProjectionInputs,
  ProjectionOptions,
} from '@/lib/horizon/projection/types';
import type {
  ScenarioDiff,
  ScenarioEntityType,
} from '@/lib/horizon/scenarios/types';
import { HeadlineMetrics } from './HeadlineMetrics';
import { BalanceLineChart } from './BalanceLineChart';
import { WaterfallChart } from './WaterfallChart';
import { InlineNumberField } from '@/components/horizon/shared/InlineNumberField';
import { Button } from '@/components/ui/Button';
import { createScenarioFromDraftAction } from '@/app/actions/horizon-scenarios';

type DraftDiff = Omit<ScenarioDiff, 'id' | 'scenarioId'>;

function draftKey(d: Pick<DraftDiff, 'entityType' | 'entityId' | 'field'>) {
  return `${d.entityType}:${d.entityId}:${d.field}`;
}

export function TimelineClient({
  inputs,
  options,
  view,
}: {
  inputs: ProjectionInputs;
  options: ProjectionOptions;
  view: 'line' | 'waterfall' | 'table';
}) {
  const t = useTranslations('Horizon.scenarios');
  const router = useRouter();

  const [drafts, setDrafts] = useState<Map<string, DraftDiff>>(new Map());
  const [saving, setSaving] = useState(false);

  const draftList = useMemo(() => Array.from(drafts.values()), [drafts]);

  const projection = useMemo(() => {
    const effectiveInputs =
      draftList.length === 0
        ? inputs
        : applyScenarioDiffs(
            inputs,
            draftList.map((d) => ({ ...d, id: '', scenarioId: '' })),
            []
          );
    return projectCashflow(effectiveInputs, options);
  }, [inputs, options, draftList]);

  const metrics = useMemo(
    () => projectionMetrics(projection, options, inputs.streams),
    [projection, options, inputs.streams]
  );

  function setDraft(
    entityType: ScenarioEntityType,
    entityId: string,
    field: string,
    value: number | boolean
  ) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(draftKey({ entityType, entityId, field }), {
        entityType,
        entityId,
        field,
        value,
        effectiveDate: null,
      });
      return next;
    });
  }

  async function saveAsScenario() {
    const name = window.prompt(t('savePromptTitle'));
    if (!name) return;
    setSaving(true);
    try {
      const result = await createScenarioFromDraftAction({
        name,
        diffs: draftList.map(({ entityType, entityId, field, value }) => ({
          entityType,
          entityId,
          field,
          value,
        })),
      });
      if (result.ok) {
        setDrafts(new Map());
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-4 shadow space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t('whatIfTitle')}</h2>
          <div className="flex gap-2">
            {draftList.length > 0 && (
              <span className="text-xs text-ink-muted self-center">
                {t('unsavedChanges', { count: draftList.length })}
              </span>
            )}
            <Button
              variant="ghost"
              disabled={draftList.length === 0}
              onClick={() => setDrafts(new Map())}
            >
              {t('resetToBaseline')}
            </Button>
            <Button
              variant="secondary"
              disabled={draftList.length === 0 || saving}
              onClick={saveAsScenario}
            >
              {t('saveAsScenario')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-ink-muted">{t('whatIfDescription')}</p>

        <WhatIfRows inputs={inputs} onChange={setDraft} />
      </div>

      <div className="rounded bg-white p-4 shadow">
        <HeadlineMetrics metrics={metrics} />
      </div>

      {view === 'line' && (
        <div className="rounded bg-white p-4 shadow">
          <BalanceLineChart
            dailyBalances={projection.dailyBalances}
            events={projection.events}
            reportingCurrency={options.reportingCurrency}
          />
        </div>
      )}

      {view === 'waterfall' && (
        <div className="rounded bg-white p-4 shadow">
          <WaterfallChart
            events={projection.events}
            reportingCurrency={options.reportingCurrency}
          />
        </div>
      )}
    </div>
  );
}

function WhatIfRows({
  inputs,
  onChange,
}: {
  inputs: ProjectionInputs;
  onChange: (
    entityType: ScenarioEntityType,
    entityId: string,
    field: string,
    value: number | boolean
  ) => void;
}) {
  const t = useTranslations('Horizon.scenarios');

  const liveStreams = inputs.streams.filter((s) => !s.archived);
  const liveObligations = inputs.obligations.filter((o) => !o.archived);
  const liveDailyExpenses = inputs.dailyExpenses.filter((e) => !e.archived);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-ink-muted">
          {t('incomeStreams')}
        </h3>
        {liveStreams.map((stream) => (
          <div key={stream.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{stream.name}</span>
            {stream.kind === 'hourly' ? (
              <InlineNumberField
                valueMinor={stream.hourlyRateMinor}
                currency={stream.currency}
                aria-label={stream.name}
                onChange={(v) => onChange('incomeStream', stream.id, 'hourlyRateMinor', v)}
              />
            ) : (
              <InlineNumberField
                valueMinor={stream.fixedAmountMinor}
                currency={stream.currency}
                aria-label={stream.name}
                onChange={(v) => onChange('incomeStream', stream.id, 'fixedAmountMinor', v)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-ink-muted">
          {t('obligations')}
        </h3>
        {liveObligations.map((obligation) => (
          <div key={obligation.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{obligation.name}</span>
            <InlineNumberField
              valueMinor={obligation.amountMinor}
              currency={obligation.currency}
              aria-label={obligation.name}
              onChange={(v) => onChange('obligation', obligation.id, 'amountMinor', v)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-ink-muted">
          {t('dailyExpenses')}
        </h3>
        {liveDailyExpenses.map((expense) => (
          <div key={expense.id} className="flex items-center justify-between gap-2">
            <span className="truncate text-sm">{expense.name}</span>
            <InlineNumberField
              valueMinor={expense.capMinor ?? expense.dailyAmountMinor}
              currency={expense.currency}
              aria-label={expense.name}
              onChange={(v) =>
                onChange(
                  'dailyExpense',
                  expense.id,
                  expense.capMinor !== null ? 'capMinor' : 'dailyAmountMinor',
                  v
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
