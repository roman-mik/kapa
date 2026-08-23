/**
 * §5-D3. Negative-day warnings, suggestions, and dismissal application.
 *
 * A date raises a warning when EITHER the reporting-currency total closes
 * below zero OR any live includeInTotal account closes below zero in its own
 * currency. Accounts are not fungible — you cannot pay rent out of a business
 * account by fiat — and §2-D2's motivating scenario is precisely a household
 * total of +200,000 hiding a personal account at −124,600.
 *
 * Suggestions are computed once per maximal negative run and shared by every
 * day in it, not recomputed per day — otherwise day 3 of a 5-day run gets
 * advice that leaves days 1–2 negative (critique N-h).
 */

import type { Currency } from '@/lib/types';
import type {
  Projection,
  NegativeDay,
  Suggestion,
  SuggestionOptions,
  SuggestionScope,
  ProjectionDismissal,
} from './types';

/**
 * §5-D3. A date raises a warning when EITHER the reporting-currency total
 * closes below zero OR any live includeInTotal account closes below zero in its
 * own currency. Accounts are not fungible (critique N1, M3).
 *
 * An account whose OPENING balance is already negative does not fire the
 * account trigger — it is already negative today and the projection is not
 * telling the user anything new (critique N-h).
 *
 * Returns NegativeDay without dismissed/dismissedReason flags — those are
 * added by applyDismissals.
 */
export function negativeDays(
  projection: Projection
): Omit<NegativeDay, 'dismissed' | 'dismissedReason'>[] {
  const result: Omit<NegativeDay, 'dismissed' | 'dismissedReason'>[] = [];

  // Build opening balances per account
  const openingBalances = new Map<
    string,
    { balanceMinor: number; currency: Currency }
  >();
  if (projection.dailyBalances.length > 0) {
    for (const account of projection.dailyBalances[0].accounts) {
      openingBalances.set(account.accountId, {
        balanceMinor: account.balanceMinor,
        currency: account.currency,
      });
    }
  }

  for (const dailyBalance of projection.dailyBalances) {
    const totalNegative = dailyBalance.totalMinor < 0;

    // Find accounts that are negative and should trigger
    const negativeAccountIds: string[] = [];
    for (const account of dailyBalance.accounts) {
      if (!account.includeInTotal) continue;
      if (account.balanceMinor < 0) {
        // Check if opening balance was already negative
        const opening = openingBalances.get(account.accountId);
        if (opening && opening.balanceMinor >= 0) {
          // Only fire if opening was non-negative
          negativeAccountIds.push(account.accountId);
        } else if (!opening) {
          // Account present in dailyBalance but not in opening — should not happen,
          // but be defensive
          negativeAccountIds.push(account.accountId);
        }
      }
    }

    const accountNegative = negativeAccountIds.length > 0;

    if (!totalNegative && !accountNegative) {
      continue; // No warning on this day
    }

    // Determine the trigger and shortfall
    let trigger: 'total' | 'account' | 'both' = 'total';
    let shortfallMinor = 0;
    let shortfallCurrency: Currency =
      projection.dailyBalances[0]?.accounts[0]?.currency ?? 'USD';

    if (totalNegative && accountNegative) {
      trigger = 'both';
      // Use the worse of the two
      if (Math.abs(dailyBalance.totalMinor) > 0) {
        shortfallMinor = Math.abs(dailyBalance.totalMinor);
        shortfallCurrency =
          projection.dailyBalances[0]?.accounts[0]?.currency ?? 'USD';
      }
    } else if (totalNegative) {
      trigger = 'total';
      shortfallMinor = Math.abs(dailyBalance.totalMinor);
      shortfallCurrency =
        projection.dailyBalances[0]?.accounts[0]?.currency ?? 'USD';
    } else {
      // Account trigger only
      trigger = 'account';
      // Get the worst account shortfall
      for (const accountId of negativeAccountIds) {
        const account = dailyBalance.accounts.find(
          (a) => a.accountId === accountId
        );
        if (account) {
          const accountShortfall = Math.abs(account.balanceMinor);
          if (accountShortfall > shortfallMinor) {
            shortfallMinor = accountShortfall;
            shortfallCurrency = account.currency;
          }
        }
      }
    }

    result.push({
      date: dailyBalance.date,
      shortfallMinor,
      shortfallCurrency,
      trigger,
      negativeAccountIds,
      suggestions: [], // Will be populated by suggestFixes
    });
  }

  return result;
}

/**
 * "The nearest fix" — three EXACT functions over the swept series. No re-sweep,
 * no approximation, no heuristics.
 *
 * Suggestions are computed once per negative RUN and attached to every day in
 * it, not recomputed per day (critique N-h). This function is called once per
 * maximal run; the caller attaches the result to every day in that run.
 *
 * ENABLING IDENTITY: moving a single convertible event of signed amount A from
 * day d0 to day d1 > d0 adds −A to series[t] for every t ∈ [d0, d1 − 1] and
 * changes nothing else. So every "would this fix it" question is answerable from
 * PREFIX/SUFFIX MINIMA of the daily series, computed once in O(D).
 */
export function suggestFixes(
  projection: Projection,
  date: string,
  options: SuggestionOptions
): Suggestion[] {
  // Find the maximal run containing this date
  const negDays = negativeDays(projection);
  const negDayIndex = negDays.findIndex((d) => d.date === date);
  if (negDayIndex === -1) return []; // Not a negative day

  const negDay = negDays[negDayIndex];

  // Find run boundaries
  let runStart = negDayIndex;
  while (
    runStart > 0 &&
    negDays[runStart - 1].date ===
      projection.dailyBalances[
        projection.dailyBalances.findIndex(
          (db) => db.date === negDays[runStart - 1].date
        ) - 1
      ]?.date
  ) {
    runStart--;
  }

  let runEnd = negDayIndex;
  while (
    runEnd < negDays.length - 1 &&
    negDays[runEnd + 1].date ===
      projection.dailyBalances[
        projection.dailyBalances.findIndex(
          (db) => db.date === negDays[runEnd + 1].date
        ) + 1
      ]?.date
  ) {
    runEnd++;
  }

  const runDates = negDays.slice(runStart, runEnd + 1);
  const worstShortfall = Math.max(...runDates.map((d) => d.shortfallMinor));

  const suggestions: Suggestion[] = [];

  if (negDay.trigger === 'total' || negDay.trigger === 'both') {
    // Compute suggestions for total
    const totalSuggestions = suggestFixesForScope(
      projection,
      date,
      options,
      { kind: 'total' },
      worstShortfall
    );
    suggestions.push(...totalSuggestions);
  }

  if (negDay.trigger === 'account' || negDay.trigger === 'both') {
    // Compute suggestions for each negative account
    for (const accountId of negDay.negativeAccountIds) {
      const accountSuggestions = suggestFixesForScope(
        projection,
        date,
        options,
        { kind: 'account', accountId, currency: negDay.shortfallCurrency },
        worstShortfall
      );
      suggestions.push(...accountSuggestions);
    }
  }

  return suggestions.sort((a, b) => {
    // Rank by reference-date distance from negDate asc, then amountMinor desc, then id asc
    const aRefDate = a.kind === 'holdBack' ? a.from?.date : a.eventDate;
    const bRefDate = b.kind === 'holdBack' ? b.from?.date : b.eventDate;

    // Handle nulls: null sorts last
    if (aRefDate === null || aRefDate === undefined) return 1;
    if (bRefDate === null || bRefDate === undefined) return -1;

    const aDist = Math.abs(
      new Date(aRefDate).getTime() - new Date(date).getTime()
    );
    const bDist = Math.abs(
      new Date(bRefDate).getTime() - new Date(date).getTime()
    );

    if (aDist !== bDist) return aDist - bDist;

    const aAmount =
      a.kind === 'shiftPayment' || a.kind === 'bringForward'
        ? a.amountMinor
        : a.amountMinor;
    const bAmount =
      b.kind === 'shiftPayment' || b.kind === 'bringForward'
        ? b.amountMinor
        : b.amountMinor;
    if (aAmount !== bAmount) return bAmount - aAmount;

    return a.id.localeCompare(b.id);
  });
}

function suggestFixesForScope(
  projection: Projection,
  date: string,
  options: SuggestionOptions,
  scope: SuggestionScope,
  worstShortfall: number
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const dateIndex = projection.dailyBalances.findIndex(
    (db) => db.date === date
  );
  if (dateIndex === -1) return [];

  // Get the series to analyze
  const series =
    scope.kind === 'total'
      ? projection.dailyBalances.map((db) => db.totalMinor)
      : projection.dailyBalances.map((db) => {
          const account = db.accounts.find(
            (a) => a.accountId === scope.accountId
          );
          return account ? account.balanceMinor : 0;
        });

  // Find candidates and apply the three suggestion algorithms
  const d0 = dateIndex;

  // shiftPayment
  const shiftCandidate = findShiftPaymentCandidate(
    projection,
    d0,
    series,
    scope,
    options.shiftWindowDays,
    worstShortfall
  );
  if (shiftCandidate) {
    suggestions.push(shiftCandidate);
  }

  // bringForward
  const bringCandidate = findBringForwardCandidate(
    projection,
    d0,
    series,
    scope
  );
  if (bringCandidate) {
    suggestions.push(bringCandidate);
  }

  // holdBack (always emitted)
  suggestions.push(
    findHoldBackSuggestion(projection, d0, series, scope, worstShortfall)
  );

  return suggestions;
}

function findShiftPaymentCandidate(
  projection: Projection,
  d0: number,
  series: number[],
  scope: SuggestionScope,
  shiftWindowDays: number,
  worstShortfall: number
): Suggestion | null {
  const date = projection.dailyBalances[d0].date;
  const windowStart = new Date(date);
  windowStart.setDate(windowStart.getDate() - shiftWindowDays);
  const windowStartStr = windowStart.toISOString().split('T')[0];

  // Find outflow candidates
  const candidates = projection.events.filter((event) => {
    if (event.unconvertible || event.convertedMinor === null) return false;
    if (event.convertedMinor >= 0) return false; // Not an outflow
    if (event.date < windowStartStr || event.date > date) return false;
    if (scope.kind === 'account' && event.accountId !== scope.accountId)
      return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Pick smallest-magnitude candidate >= worst, or largest if none
  let chosen = candidates[0];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const mag = Math.abs(candidate.convertedMinor ?? 0);
    const chosenMag = Math.abs(chosen.convertedMinor ?? 0);

    if (mag >= worstShortfall && chosenMag < worstShortfall) {
      chosen = candidate;
    } else if (
      mag >= worstShortfall &&
      chosenMag >= worstShortfall &&
      mag < chosenMag
    ) {
      chosen = candidate;
    } else if (mag > chosenMag && chosenMag < worstShortfall) {
      chosen = candidate;
    }
  }

  // Find suggested date: earliest d > d0 with min(series[t] + |A|, t ∈ [d0, d−1]) ≥ 0
  const A = Math.abs(chosen.convertedMinor ?? 0);
  let suggestedDate: string | null = null;

  for (let d = d0 + 1; d < series.length; d++) {
    let minOnRange = Infinity;
    for (let t = d0; t < d; t++) {
      minOnRange = Math.min(minOnRange, series[t] + A);
    }
    if (minOnRange >= 0) {
      suggestedDate = projection.dailyBalances[d].date;
      break;
    }
  }

  const id = `shiftPayment:${date}:${chosen.sourceId}:${chosen.date}`;

  return {
    kind: 'shiftPayment',
    id,
    scope,
    sourceId: chosen.sourceId,
    eventLabel: chosen.label,
    eventDate: chosen.date,
    amountMinor: A,
    suggestedDate,
  };
}

function findBringForwardCandidate(
  projection: Projection,
  d0: number,
  series: number[],
  scope: SuggestionScope
): Suggestion | null {
  // Find the earliest convertible inflow after d0
  const date = projection.dailyBalances[d0].date;
  let inflow: (typeof projection.events)[0] | null = null;

  for (const event of projection.events) {
    if (event.date <= date) continue;
    if (event.unconvertible || event.convertedMinor === null) continue;
    if (event.convertedMinor <= 0) continue; // Not an inflow
    if (scope.kind === 'account' && event.accountId !== scope.accountId)
      continue;

    inflow = event;
    break;
  }

  if (!inflow) return null;

  // Check if it clears the entire run
  const d1 = projection.dailyBalances.findIndex(
    (db) => db.date === inflow.date
  );
  if (d1 === -1) return null;

  const A = inflow.convertedMinor ?? 0; // Already checked for null above
  let minOnRun = Infinity;
  for (let t = d0; t < d1; t++) {
    minOnRun = Math.min(minOnRun, series[t]);
  }

  if (minOnRun + A < 0) return null; // Doesn't clear the run

  const id = `bringForward:${date}:${inflow.sourceId}:${inflow.date}`;

  return {
    kind: 'bringForward',
    id,
    scope,
    sourceId: inflow.sourceId,
    eventLabel: inflow.label,
    eventDate: inflow.date,
    amountMinor: A,
    toDate: date, // First day of the run
  };
}

function findHoldBackSuggestion(
  projection: Projection,
  d0: number,
  series: number[],
  scope: SuggestionScope,
  worstShortfall: number
): Suggestion {
  const date = projection.dailyBalances[d0].date;

  // Find nearest convertible inflow at or before d0
  let sourceInflow: (typeof projection.events)[0] | null = null;

  for (let i = projection.events.length - 1; i >= 0; i--) {
    const event = projection.events[i];
    if (event.date > date) continue;
    if (event.unconvertible || event.convertedMinor === null) continue;
    if (event.convertedMinor <= 0) continue; // Not an inflow
    if (scope.kind === 'account' && event.accountId !== scope.accountId)
      continue;

    sourceInflow = event;
    break;
  }

  const id = `holdBack:${date}:none:${sourceInflow?.date ?? 'none'}`;

  return {
    kind: 'holdBack',
    id,
    scope,
    amountMinor: worstShortfall,
    from: sourceInflow
      ? {
          label: sourceInflow.label,
          date: sourceInflow.date,
          sourceId: sourceInflow.sourceId,
        }
      : null,
  };
}

/**
 * FLAGS RATHER THAN FILTERS: returns every negative day with dismissed set.
 * The banner filters; the data doesn't. That is what keeps firstNegativeDate (a
 * metric) from ever naming a date the array has hidden.
 *
 * A dismissal suppresses a warning ONLY while the current shortfall is no worse
 * than the dismissed one AND the reporting currency still matches. A worsening
 * shortfall or a currency change re-surfaces it — otherwise dismissing a −100
 * warning silently hides a −100,000 one on the same date.
 */
export function applyDismissals(
  days: Omit<NegativeDay, 'dismissed' | 'dismissedReason'>[],
  dismissals: ProjectionDismissal[],
  reportingCurrency: Currency
): NegativeDay[] {
  const dismissalMap = new Map(dismissals.map((d) => [d.negativeDate, d]));

  return days.map((day) => {
    const dismissal = dismissalMap.get(day.date);
    const dismissed =
      dismissal &&
      dismissal.shortfallMinor >= day.shortfallMinor &&
      dismissal.currency === reportingCurrency;

    return {
      ...day,
      dismissed: !!dismissed,
      dismissedReason: dismissed ? dismissal.reason : null,
    };
  });
}
