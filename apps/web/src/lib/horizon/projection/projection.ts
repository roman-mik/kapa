/**
 * The projection engine. Pure and deterministic: no Date.now(), no live FX, no I/O.
 *
 * Filter -> build -> convert -> sort -> sweep -> derive, once each:
 *
 *  1. FILTER ARCHIVED entities.
 *  2. buildProjectionEvents over the padded window.                     O(E)
 *  3. Convert each event TWICE, pinned to options.today.
 *  4. Sort once with an explicit comparator.                           O(E log E)
 *  5. Sweep and emit DailyBalance, one per calendar day.               O(E + D*A)
 *  6. Derive monthPoints from the swept series.
 */

import type {
  ProjectionInputs,
  ProjectionOptions,
  Projection,
  ProjectionEvent,
  DailyBalance,
  AccountDayBalance,
  MonthPair,
} from './types';
import { buildProjectionEvents } from './events';
import { addDays, daysBetween, monthBounds } from '@/lib/horizon/schedule';
import { pickRate, convert } from '@/lib/horizon/fx';
import type { Currency } from '@/lib/types';

export function projectCashflow(
  inputs: ProjectionInputs,
  options: ProjectionOptions
): Projection {
  let { from, to } = options;
  const { today, reportingCurrency, order } = options;

  // Clamp defensively
  from = from < today ? today : from;
  to = to < from ? from : to;

  // Step 1: Filter archived
  const liveAccounts = inputs.accounts.filter((a) => !a.archived);

  // Step 2: Build events
  const events = buildProjectionEvents(inputs, { ...options, from, to });

  // Step 3: Convert each event twice
  const missingRates: { from: Currency; to: Currency }[] = [];
  let hasMissingRate = false;
  let oldestRateAsOfDate: string | null = null;

  for (const event of events) {
    // Find the account
    const account = liveAccounts.find((a) => a.id === event.accountId);
    if (!account) {
      // Account doesn't exist or is archived — mark unconvertible
      event.unconvertible = true;
      event.convertedMinor = null;
      continue;
    }

    // First conversion: event currency -> account currency
    let convertedToAccountMinor: number | null = event.amountMinor;
    if (event.currency !== account.currency) {
      const rate = pickRate(inputs.rates, {
        base: event.currency,
        quote: account.currency,
        onOrBefore: today,
      });
      if (!rate) {
        hasMissingRate = true;
        missingRates.push({ from: event.currency, to: account.currency });
        event.unconvertible = true;
        event.convertedMinor = null;
        continue;
      }
      convertedToAccountMinor = convert(
        event.amountMinor as unknown as number,
        event.currency,
        account.currency,
        rate
      );
      if (oldestRateAsOfDate === null || rate.asOfDate < oldestRateAsOfDate) {
        oldestRateAsOfDate = rate.asOfDate;
      }
    }

    // Second conversion: account currency -> reporting currency
    let convertedToReportingMinor: number | null = convertedToAccountMinor;
    if (account.currency !== reportingCurrency) {
      const rate = pickRate(inputs.rates, {
        base: account.currency,
        quote: reportingCurrency,
        onOrBefore: today,
      });
      if (!rate) {
        hasMissingRate = true;
        missingRates.push({ from: account.currency, to: reportingCurrency });
        event.unconvertible = true;
        event.convertedMinor = null;
        continue;
      }
      convertedToReportingMinor = convert(
        convertedToAccountMinor,
        account.currency,
        reportingCurrency,
        rate
      );
      if (oldestRateAsOfDate === null || rate.asOfDate < oldestRateAsOfDate) {
        oldestRateAsOfDate = rate.asOfDate;
      }
    }

    event.convertedMinor = convertedToReportingMinor;
  }

  // Step 4: Sort
  const orderIndex = (kind: (typeof events)[0]['kind']): number => {
    const idx = order.indexOf(kind);
    return idx === -1 ? 999 : idx;
  };

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const orderDiff = orderIndex(a.kind) - orderIndex(b.kind);
    if (orderDiff !== 0) return orderDiff;
    if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
    const scheduleIdA = a.scheduleId ?? '';
    const scheduleIdB = b.scheduleId ?? '';
    if (scheduleIdA !== scheduleIdB)
      return scheduleIdA.localeCompare(scheduleIdB);
    return a.occurrenceIndex - b.occurrenceIndex;
  });

  // Step 5: Sweep
  const dailyBalances: DailyBalance[] = [];
  const accountBalances = new Map<string, number>();

  // Initialize account balances from currentBalanceMinor
  for (const account of liveAccounts) {
    accountBalances.set(
      account.id,
      account.currentBalanceMinor as unknown as number
    );
  }

  // Walk the days and events
  let eventIndex = 0;
  let runningReportingTotal = 0;

  // Compute opening total
  for (const account of liveAccounts) {
    let converted: number = account.currentBalanceMinor as unknown as number;
    if (account.currency !== reportingCurrency) {
      const rate = pickRate(inputs.rates, {
        base: account.currency,
        quote: reportingCurrency,
        onOrBefore: today,
      });
      if (rate) {
        converted = convert(
          account.currentBalanceMinor as unknown as number,
          account.currency,
          reportingCurrency,
          rate
        );
      } else {
        // No rate, skip this account from total
        continue;
      }
    }
    if (account.includeInTotal) {
      runningReportingTotal += converted;
    }
  }

  const dayRange = daysBetween(from, to);
  for (let i = 0; i <= dayRange; i++) {
    const date = addDays(from, i);

    // Find all events on this date
    const dayEvents: ProjectionEvent[] = [];
    while (eventIndex < events.length && events[eventIndex].date === date) {
      dayEvents.push(events[eventIndex]);
      eventIndex++;
    }

    // Apply events to balances
    for (const event of dayEvents) {
      if (!event.unconvertible && event.convertedMinor !== null) {
        runningReportingTotal += event.convertedMinor;
      }

      // Update account balance
      const account = liveAccounts.find((a) => a.id === event.accountId);
      if (account && !event.unconvertible) {
        const currentBalance = accountBalances.get(event.accountId) ?? 0;
        accountBalances.set(
          event.accountId,
          currentBalance + event.amountMinor
        );
      }

      // Stamp balances on the event
      const balanceAfter = runningReportingTotal;
      const balanceBefore = balanceAfter - (event.convertedMinor || 0);
      event.balanceBeforeMinor = balanceBefore;
      event.balanceAfterMinor = balanceAfter;
    }

    // Create DailyBalance
    const accounts: AccountDayBalance[] = [];
    let totalMinor = 0;

    for (const account of liveAccounts) {
      const balanceMinor = accountBalances.get(account.id) ?? 0;
      let convertedMinor: number | null = balanceMinor;

      if (account.currency !== reportingCurrency) {
        const rate = pickRate(inputs.rates, {
          base: account.currency,
          quote: reportingCurrency,
          onOrBefore: today,
        });

        if (rate) {
          convertedMinor = convert(
            balanceMinor,
            account.currency,
            reportingCurrency,
            rate
          );
        } else {
          convertedMinor = null;
        }
      }

      if (convertedMinor !== null && account.includeInTotal) {
        totalMinor += convertedMinor;
      }

      accounts.push({
        accountId: account.id,
        balanceMinor:
          balanceMinor as unknown as typeof account.currentBalanceMinor,
        convertedMinor,
        includeInTotal: account.includeInTotal,
        currency: account.currency,
      });
    }

    dailyBalances.push({
      date,
      totalMinor,
      accounts,
    });
  }

  // Step 6: Derive monthPoints
  const monthPoints: MonthPair[] = [];
  const monthBalances = new Map<
    string,
    { end: number; minDate: string; min: number }
  >();

  for (const daily of dailyBalances) {
    // Parse month from date
    const month = daily.date.substring(0, 7);

    if (!monthBalances.has(month)) {
      monthBalances.set(month, {
        end: daily.totalMinor,
        minDate: daily.date,
        min: daily.totalMinor,
      });
    } else {
      const entry = monthBalances.get(month)!;
      entry.end = daily.totalMinor;
      if (daily.totalMinor < entry.min) {
        entry.min = daily.totalMinor;
        entry.minDate = daily.date;
      }
    }
  }

  for (const [month, data] of monthBalances) {
    const bounds = monthBounds(month);
    const isPartial =
      dailyBalances[0].date > bounds.first ||
      dailyBalances[dailyBalances.length - 1].date < bounds.last;

    monthPoints.push({
      month,
      end: { date: bounds.last, balanceMinor: data.end },
      minimum: { date: data.minDate, balanceMinor: data.min },
      partial: isPartial,
    });
  }

  return {
    dailyBalances,
    events,
    monthPoints,
    openingTotalMinor: dailyBalances[0]?.totalMinor ?? 0,
    hasMissingRate,
    missingRates,
    oldestRateAsOfDate,
  };
}
