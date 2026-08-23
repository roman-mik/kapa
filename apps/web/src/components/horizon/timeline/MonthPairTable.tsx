/**
 * Month summary table.
 * Renders both end and minimum per MonthPair in the same row.
 * Partial months are visibly labelled (§2-D2).
 */

import { getTranslations } from 'next-intl/server';
import type { MonthPair } from '@/lib/horizon/projection/types';
import type { Currency } from '@/lib/types';

interface MonthPairTableProps {
  monthPoints: MonthPair[];
  reportingCurrency: Currency;
}

export async function MonthPairTable({
  monthPoints,
  reportingCurrency,
}: MonthPairTableProps) {
  const t = await getTranslations('Horizon.timeline');

  return (
    <table className="w-full border-collapse text-xs md:text-sm">
      <thead>
        <tr className="border-b border-b-2 bg-ink-muted/10">
          <th className="px-3 py-2 text-left font-medium">
            {t('monthHeader')}
          </th>
          <th className="px-3 py-2 text-left font-medium">
            {t('monthEndLabel')}
          </th>
          <th className="px-3 py-2 text-right font-medium">
            {t('monthEndBalance')}
          </th>
          <th className="px-3 py-2 text-left font-medium">
            {t('minimumLabel')}
          </th>
          <th className="px-3 py-2 text-right font-medium">
            {t('minimumBalance')}
          </th>
        </tr>
      </thead>
      <tbody>
        {monthPoints.map((monthPair) => (
          <tr key={monthPair.month} className="border-b">
            <td className="px-3 py-2 text-sm">
              {monthPair.month}
              {monthPair.partial && (
                <span className="ml-2 text-xs text-ink-muted">
                  {t('partialLabel')}
                </span>
              )}
            </td>
            <td className="px-3 py-2 text-sm">{monthPair.end.date}</td>
            <td className="px-3 py-2 text-right text-sm">
              {(monthPair.end.balanceMinor / 100).toFixed(2)}{' '}
              {reportingCurrency}
            </td>
            <td className="px-3 py-2 text-sm">{monthPair.minimum.date}</td>
            <td className="px-3 py-2 text-right text-sm">
              {(monthPair.minimum.balanceMinor / 100).toFixed(2)}{' '}
              {reportingCurrency}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
