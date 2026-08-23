/**
 * Headline metrics for projection: monthly surplus, annual equivalent, runway, first negative date.
 * Each metric is expandable to show its inputs, formula, and any caveat via <details>.
 */

'use client';

import { useTranslations } from 'next-intl';
import type { ProjectionMetrics } from '@/lib/horizon/projection/types';

interface HeadlineMetricsProps {
  metrics: ProjectionMetrics;
}

export function HeadlineMetrics({ metrics }: HeadlineMetricsProps) {
  const t = useTranslations('Horizon.timeline');

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">{t('metricsHeadline')}</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t('metrics.monthlySurplus.label')}
          metric={metrics.monthlySurplusMinor}
          formatValue={(v: number) => Math.round(v).toLocaleString()}
        />
        <MetricCard
          label={t('metrics.annualEquivalent.label')}
          metric={metrics.annualEquivalentMinor}
          formatValue={(v: number) => Math.round(v).toLocaleString()}
        />
        <MetricCard
          label={t('metrics.runway.label')}
          metric={metrics.runwayMonths}
          formatValue={(v: number | null) => {
            if (v === null) {
              return t('metrics.runway.indefinite');
            }
            return `${Math.round(v)} ${t('metrics.runway.months')}`;
          }}
        />
        <MetricCard
          label={t('metrics.firstNegativeDate.label')}
          metric={metrics.firstNegativeDate}
          formatValue={(v: string | null) =>
            v || t('metrics.firstNegativeDate.none')
          }
        />
      </div>
    </div>
  );
}

function MetricCard<T>({
  label,
  metric,
  formatValue,
}: {
  label: string;
  metric: {
    value: T;
    inputs: Record<string, number | string | null>;
    formulaKey: string;
    caveatKey: string | null;
  };
  formatValue: (v: T) => string;
}) {
  const t = useTranslations('Horizon.timeline');
  const tf = useTranslations('Horizon.formulas');

  const displayValue = formatValue(metric.value);
  const formulaText = tf(metric.formulaKey);
  const caveatText = metric.caveatKey
    ? tf(`caveats.${metric.caveatKey}`)
    : null;

  return (
    <details className="rounded border border-gray-200 bg-white">
      <summary className="flex cursor-pointer items-baseline justify-between px-4 py-3 hover:bg-gray-50">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="font-semibold text-gray-900">{displayValue}</span>
      </summary>
      <div className="space-y-3 border-t border-gray-200 px-4 py-3 text-sm">
        <div>
          <div className="font-medium text-gray-700 mb-1">
            {t('metrics.formula')}
          </div>
          <p className="text-gray-600">{formulaText}</p>
        </div>

        {caveatText && (
          <div>
            <div className="font-medium text-gray-700 mb-1">
              {t('metrics.caveat')}
            </div>
            <p className="text-gray-600">{caveatText}</p>
          </div>
        )}

        <div>
          <div className="font-medium text-gray-700 mb-2">
            {t('metrics.inputs')}
          </div>
          <dl className="space-y-1 text-xs">
            {Object.entries(metric.inputs).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <dt className="text-gray-600">{key}:</dt>
                <dd className="font-mono text-gray-900">
                  {value === null ? '—' : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </details>
  );
}
