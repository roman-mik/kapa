'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ProjectionInputs } from '@/lib/horizon/projection/types';
import type { Scenario, ScenarioDiff } from '@/lib/horizon/scenarios/types';
import { saveScenarioDiffAction } from '@/app/actions/horizon-scenarios';
import { InlineNumberField } from '@/components/horizon/shared/InlineNumberField';
import { useToast } from '@/components/ui/Toast';

/** Reads the diff value for `(entityType, entityId, field)` if one exists,
 *  falling back to the baseline value passed in — a scenario's editor always
 *  shows the currently EFFECTIVE value, never a blank slate. */
function effective(
  diffs: ScenarioDiff[],
  entityType: ScenarioDiff['entityType'],
  entityId: string,
  field: string,
  fallback: number | boolean
): number | boolean {
  const diff = diffs.find(
    (d) => d.entityType === entityType && d.entityId === entityId && d.field === field
  );
  return diff ? diff.value : fallback;
}

export function ScenarioEditor({
  scenario,
  diffs,
  inputs,
}: {
  scenario: Scenario;
  diffs: ScenarioDiff[];
  inputs: ProjectionInputs;
}) {
  const t = useTranslations('Horizon.scenarios');
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(
    entityType: ScenarioDiff['entityType'],
    entityId: string,
    field: string,
    value: number | boolean
  ) {
    startTransition(async () => {
      const result = await saveScenarioDiffAction(scenario.id, {
        entityType,
        entityId,
        field,
        value,
      });
      if (result.ok) {
        toast.success(t('diffSaved'));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4 rounded border border-sand-200 bg-white p-4">
      <h3 className="font-semibold">
        {t('editorTitle')}: {scenario.name}
      </h3>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-ink-muted">
          {t('incomeStreams')}
        </h4>
        {inputs.streams
          .filter((s) => !s.archived)
          .map((stream) => {
            const enabled = effective(
              diffs,
              'incomeStream',
              stream.id,
              'archived',
              false
            ) as boolean === false;
            return (
              <div key={stream.id} className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={pending}
                    onChange={(e) =>
                      save('incomeStream', stream.id, 'archived', !e.target.checked)
                    }
                  />
                  {stream.name}
                </label>
                {stream.kind === 'hourly' ? (
                  <InlineNumberField
                    valueMinor={
                      effective(
                        diffs,
                        'incomeStream',
                        stream.id,
                        'hourlyRateMinor',
                        stream.hourlyRateMinor
                      ) as number
                    }
                    currency={stream.currency}
                    onChange={(v) => save('incomeStream', stream.id, 'hourlyRateMinor', v)}
                  />
                ) : (
                  <InlineNumberField
                    valueMinor={
                      effective(
                        diffs,
                        'incomeStream',
                        stream.id,
                        'fixedAmountMinor',
                        stream.fixedAmountMinor
                      ) as number
                    }
                    currency={stream.currency}
                    onChange={(v) => save('incomeStream', stream.id, 'fixedAmountMinor', v)}
                  />
                )}
              </div>
            );
          })}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-ink-muted">{t('obligations')}</h4>
        {inputs.obligations
          .filter((o) => !o.archived)
          .map((obligation) => (
            <div key={obligation.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{obligation.name}</span>
              <InlineNumberField
                valueMinor={
                  effective(
                    diffs,
                    'obligation',
                    obligation.id,
                    'amountMinor',
                    obligation.amountMinor
                  ) as number
                }
                currency={obligation.currency}
                onChange={(v) => save('obligation', obligation.id, 'amountMinor', v)}
              />
            </div>
          ))}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-ink-muted">{t('dailyExpenses')}</h4>
        {inputs.dailyExpenses
          .filter((e) => !e.archived)
          .map((expense) => (
            <div key={expense.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{expense.name}</span>
              <InlineNumberField
                valueMinor={
                  effective(
                    diffs,
                    'dailyExpense',
                    expense.id,
                    'dailyAmountMinor',
                    expense.dailyAmountMinor
                  ) as number
                }
                currency={expense.currency}
                onChange={(v) => save('dailyExpense', expense.id, 'dailyAmountMinor', v)}
              />
            </div>
          ))}
      </section>
    </div>
  );
}
