'use client';

/**
 * E3: monthly gap / first negative date / end balance / break-even rate per
 * scenario, best outcome per column highlighted. Modeled on
 * `MonthPairTable`'s table idiom, but keyed by scenario instead of by month.
 */
import { useTranslations } from 'next-intl';
import type { ScenarioResult } from '@/lib/horizon/scenarios/compareScenarios';
import type { Currency } from '@/lib/types';

function formatMoney(minor: number, currency: Currency) {
  return `${(minor / 100).toLocaleString()} ${currency}`;
}

const HIGHLIGHT = 'bg-green-50 font-semibold';

export function ComparisonTable({
  results,
  reportingCurrency,
}: {
  results: ScenarioResult[];
  reportingCurrency: Currency;
}) {
  const t = useTranslations('Horizon.scenarios');

  if (results.length === 0) return null;

  const gaps = results.map((r) => r.metrics.monthlySurplusMinor.value);
  const bestGap = Math.max(...gaps);

  const endBalances = results.map(
    (r) => r.dailyBalances[r.dailyBalances.length - 1]?.totalMinor ?? 0
  );
  const bestEndBalance = Math.max(...endBalances);

  const firstNegatives = results.map((r) => r.metrics.firstNegativeDate.value);
  // "Best" = no negative day at all; among those with one, the latest date.
  const hasAnyClean = firstNegatives.some((d) => d === null);
  const latestNegative = firstNegatives
    .filter((d): d is string => d !== null)
    .sort()
    .at(-1);

  const breakEvenRates = results.map((r) => r.metrics.breakEvenRateMinor.value);
  const validRates = breakEvenRates.filter((r): r is number => r !== null);
  const bestRate = validRates.length > 0 ? Math.min(...validRates) : null;

  return (
    <table className="w-full border-collapse text-xs md:text-sm">
      <thead>
        <tr className="border-b border-b-2 bg-ink-muted/10">
          <th className="px-3 py-2 text-left font-medium" />
          <th className="px-3 py-2 text-right font-medium">
            {t('columnMonthlyGap')}
          </th>
          <th className="px-3 py-2 text-left font-medium">
            {t('columnFirstNegative')}
          </th>
          <th className="px-3 py-2 text-right font-medium">
            {t('columnEndBalance')}
          </th>
          <th className="px-3 py-2 text-right font-medium">
            {t('columnBreakEvenRate')}
          </th>
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => (
          <tr key={r.scenarioId ?? 'baseline'} className="border-b">
            <td className="px-3 py-2 font-medium">
              {r.scenarioId === null ? t('baseline') : r.scenarioName}
            </td>
            <td
              className={`px-3 py-2 text-right ${gaps[i] === bestGap ? HIGHLIGHT : ''}`}
            >
              {formatMoney(gaps[i], reportingCurrency)}
            </td>
            <td
              className={`px-3 py-2 ${
                firstNegatives[i] === null && hasAnyClean ? HIGHLIGHT : ''
              } ${
                firstNegatives[i] !== null &&
                firstNegatives[i] === latestNegative &&
                !hasAnyClean
                  ? HIGHLIGHT
                  : ''
              }`}
            >
              {firstNegatives[i] ?? t('none')}
            </td>
            <td
              className={`px-3 py-2 text-right ${
                endBalances[i] === bestEndBalance ? HIGHLIGHT : ''
              }`}
            >
              {formatMoney(endBalances[i], reportingCurrency)}
            </td>
            <td
              className={`px-3 py-2 text-right ${
                breakEvenRates[i] !== null && breakEvenRates[i] === bestRate
                  ? HIGHLIGHT
                  : ''
              }`}
            >
              {breakEvenRates[i] === null
                ? t('none')
                : formatMoney(breakEvenRates[i], reportingCurrency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
