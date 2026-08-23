/**
 * Table view of projection events.
 * Dailyexpense events roll up per day inside a <details> element.
 * All other events render one row per event.
 */

import { getTranslations } from 'next-intl/server';
import type { ProjectionEvent } from '@/lib/horizon/projection/types';
import type { Currency } from '@/lib/types';

interface ProjectionTableProps {
  events: ProjectionEvent[];
  reportingCurrency: Currency;
}

export async function ProjectionTable({
  events,
  reportingCurrency,
}: ProjectionTableProps) {
  const t = await getTranslations('Horizon.timeline');
  const tKind = await getTranslations('Horizon.assumptions.eventOrder.kind');
  const tRecurrence = await getTranslations('Horizon.moneyIn.recurrence');
  const tConfidence = await getTranslations('Horizon.moneyIn.confidence');
  const tDerivation = await getTranslations('Horizon.timeline.derivation');

  const groupedByDate = new Map<string, ProjectionEvent[]>();
  const dailyExpensesByDate = new Map<string, ProjectionEvent[]>();

  for (const event of events) {
    if (!groupedByDate.has(event.date)) {
      groupedByDate.set(event.date, []);
    }
    groupedByDate.get(event.date)!.push(event);

    if (event.kind === 'dailyExpense') {
      if (!dailyExpensesByDate.has(event.date)) {
        dailyExpensesByDate.set(event.date, []);
      }
      dailyExpensesByDate.get(event.date)!.push(event);
    }
  }

  const rows = events.map((event, idx) => {
    const isDaily = event.kind === 'dailyExpense';
    const isFirstDaily =
      isDaily &&
      dailyExpensesByDate.get(event.date)?.[0]?.sourceId === event.sourceId;

    if (isDaily && !isFirstDaily) {
      return null;
    }

    const dailyExpenses = dailyExpensesByDate.get(event.date) || [];
    const isDailyRollup = isDaily && dailyExpenses.length > 1;

    return (
      <tbody key={`${event.date}-${event.sourceId}-${idx}`}>
        {isDailyRollup ? (
          <>
            <tr>
              <td className="border-b px-3 py-2 text-sm">{event.date}</td>
              <td className="border-b px-3 py-2 text-sm font-medium">
                <details>
                  <summary className="cursor-pointer">
                    {t('dailyExpensesCount', { count: dailyExpenses.length })}
                  </summary>
                  <div className="ml-4 mt-2 space-y-1 border-t pt-2">
                    {dailyExpenses.map((de) => (
                      <div
                        key={`${de.date}-${de.sourceId}`}
                        className="text-xs"
                      >
                        <span>{de.label}</span>
                        {de.convertedMinor !== null &&
                          de.convertedMinor !== de.amountMinor && (
                            <span className="text-ink-muted">
                              {' '}
                              (≈ {(de.convertedMinor / 100).toFixed(2)}{' '}
                              {reportingCurrency})
                            </span>
                          )}
                      </div>
                    ))}
                  </div>
                </details>
              </td>
              <td className="border-b px-3 py-2 text-right text-sm">
                <div>
                  {(
                    dailyExpenses.reduce((sum, de) => sum + de.amountMinor, 0) /
                    100
                  ).toFixed(2)}
                </div>
                {dailyExpenses.some(
                  (de) =>
                    de.convertedMinor !== null &&
                    de.convertedMinor !== de.amountMinor
                ) && (
                  <div className="text-xs text-ink-muted">
                    ≈{' '}
                    {(
                      dailyExpenses.reduce(
                        (sum, de) => sum + (de.convertedMinor ?? 0),
                        0
                      ) / 100
                    ).toFixed(2)}{' '}
                    {reportingCurrency}
                  </div>
                )}
              </td>
              <td className="border-b px-3 py-2 text-sm">
                {tKind('dailyExpense')}
              </td>
              <td className="border-b px-3 py-2 text-right text-sm">
                {(event.balanceBeforeMinor / 100).toFixed(2)} →{' '}
                {(event.balanceAfterMinor / 100).toFixed(2)}
              </td>
              <td className="border-b px-3 py-2 text-center text-xs">
                <span className="rounded bg-blue-100 px-2 py-1 text-blue-900">
                  {tRecurrence('recurring')}
                </span>
              </td>
              <td className="border-b px-3 py-2 text-center text-xs">
                <span className="rounded bg-green-100 px-2 py-1 text-green-900">
                  {tConfidence(event.confidence)}
                </span>
              </td>
              <td className="border-b px-3 py-2 text-center text-xs">
                <span className="rounded bg-purple-100 px-2 py-1 text-purple-900">
                  {tDerivation(event.derivation)}
                </span>
              </td>
            </tr>
          </>
        ) : (
          <tr>
            <td className="border-b px-3 py-2 text-sm">{event.date}</td>
            <td className="border-b px-3 py-2 text-sm">{event.label}</td>
            <td className="border-b px-3 py-2 text-right text-sm">
              <div>{(event.amountMinor / 100).toFixed(2)}</div>
              {event.convertedMinor !== null &&
                event.convertedMinor !== event.amountMinor && (
                  <div className="text-xs text-ink-muted">
                    ≈ {(event.convertedMinor / 100).toFixed(2)}{' '}
                    {reportingCurrency}
                  </div>
                )}
            </td>
            <td className="border-b px-3 py-2 text-sm">{tKind(event.kind)}</td>
            <td className="border-b px-3 py-2 text-right text-sm">
              {(event.balanceBeforeMinor / 100).toFixed(2)} →{' '}
              {(event.balanceAfterMinor / 100).toFixed(2)}
            </td>
            <td className="border-b px-3 py-2 text-center text-xs">
              <span className="rounded bg-blue-100 px-2 py-1 text-blue-900">
                {tRecurrence(event.recurrence)}
              </span>
            </td>
            <td className="border-b px-3 py-2 text-center text-xs">
              <span className="rounded bg-green-100 px-2 py-1 text-green-900">
                {tConfidence(event.confidence)}
              </span>
            </td>
            <td className="border-b px-3 py-2 text-center text-xs">
              <span className="rounded bg-purple-100 px-2 py-1 text-purple-900">
                {tDerivation(event.derivation)}
              </span>
            </td>
          </tr>
        )}
      </tbody>
    );
  });

  return (
    <table className="w-full border-collapse text-xs md:text-sm">
      <thead>
        <tr className="border-b border-b-2 bg-ink-muted/10">
          <th className="px-3 py-2 text-left font-medium">{t('dateHeader')}</th>
          <th className="px-3 py-2 text-left font-medium">
            {t('labelHeader')}
          </th>
          <th className="px-3 py-2 text-right font-medium">
            {t('amountHeader')}
          </th>
          <th className="px-3 py-2 text-left font-medium">{t('kindHeader')}</th>
          <th className="px-3 py-2 text-right font-medium">
            {t('balanceHeader')}
          </th>
          <th className="px-3 py-2 text-center font-medium">
            {t('recurrenceHeader')}
          </th>
          <th className="px-3 py-2 text-center font-medium">
            {t('confidenceHeader')}
          </th>
          <th className="px-3 py-2 text-center font-medium">
            {t('derivationHeader')}
          </th>
        </tr>
      </thead>
      {rows}
    </table>
  );
}
