/**
 * Pure target-rate solving for Horizon (Epic F) — "what hourly rate covers
 * my commitments?" Same discipline as `lib/horizon/fx.ts` and
 * `lib/horizon/spending/spending-math.ts`: integer money throughout, no I/O,
 * no `Date.now()`.
 *
 * D10 applied: tax has a fixed component and a marginal component, and
 * solving for a target NET income must gross up at the marginal rate —
 * `grossUpForTax` is that gross-up, `costPerNetUnit` is F3's "each extra
 * 1.00 kept costs X billed" rule of thumb.
 */
import type { Currency, Money } from '@/lib/types';
import type { FxRate } from '@/lib/horizon/types';
import { convert, pickRate } from '@/lib/horizon/fx';
import {
  daysBetween,
  daysInMonth,
  generateDates,
  type ScheduleCalendar,
} from '@/lib/horizon/schedule';
import type {
  Obligation,
  ObligationSchedule,
  DailyExpense,
} from '../spending/types';
import type { IncomeStream } from '../income/types';
import { availableWorkingHours } from '../spending/hours';

function money(n: number): Money {
  return n as Money;
}

/** Clamps `[monthFrom, monthTo]` by an entity's own `startDate`/`endDate`. */
function clampToEntity(
  monthFrom: string,
  monthTo: string,
  startDate: string,
  endDate: string | null
): { from: string; to: string } {
  const from = startDate > monthFrom ? startDate : monthFrom;
  const to = endDate && endDate < monthTo ? endDate : monthTo;
  return { from, to };
}

export interface CommitmentTotal {
  totalMinor: Money;
  /** True when at least one row couldn't be converted for lack of an FX rate. */
  hasMissingRate: boolean;
}

/**
 * The household's total monthly commitment (obligations + daily-accrual
 * expenses), converted to `reportingCurrency`, for one `YYYY-MM` month —
 * F1's "given my obligations". Unlike `categoryShares` (a share-of-total
 * view over per-occurrence amounts), this scales each obligation by the
 * occurrences its schedules actually generate in the month, clamped to the
 * obligation's own `startDate`/`endDate` — mirroring the projection
 * engine's `clampRangeByEntity` (`lib/horizon/projection/events.ts`).
 * Archived rows are excluded. A row with no usable FX rate is excluded from
 * the total and flagged, never thrown (mirrors `today.ts`).
 */
export function monthlyCommitmentTotal(
  obligations: Obligation[],
  obligationSchedules: ObligationSchedule[],
  dailyExpenses: DailyExpense[],
  month: string,
  calendar: ScheduleCalendar,
  reportingCurrency: Currency,
  rates: FxRate[],
  onOrBefore: string
): CommitmentTotal {
  const [yearStr, monthStr] = month.split('-');
  const monthFrom = `${month}-01`;
  const monthTo = `${month}-${String(daysInMonth(Number(yearStr), Number(monthStr) - 1)).padStart(2, '0')}`;

  let totalMinor = 0;
  let hasMissingRate = false;

  const addAmount = (amountMinor: number, currency: Currency) => {
    if (amountMinor === 0) return;
    if (currency === reportingCurrency) {
      totalMinor += amountMinor;
      return;
    }
    const rate = pickRate(rates, {
      base: currency,
      quote: reportingCurrency,
      onOrBefore,
    });
    if (!rate) {
      hasMissingRate = true;
      return;
    }
    totalMinor += convert(amountMinor, currency, reportingCurrency, rate);
  };

  for (const obligation of obligations) {
    if (obligation.archived) continue;
    const { from, to } = clampToEntity(
      monthFrom,
      monthTo,
      obligation.startDate,
      obligation.endDate
    );
    if (from > to) continue;

    const occurrences = obligationSchedules
      .filter((s) => s.obligationId === obligation.id)
      .reduce(
        (sum, s) => sum + generateDates(s, calendar, { from, to }).length,
        0
      );
    addAmount(obligation.amountMinor * occurrences, obligation.currency);
  }

  for (const expense of dailyExpenses) {
    if (expense.archived) continue;
    const { from, to } = clampToEntity(
      monthFrom,
      monthTo,
      expense.startDate,
      expense.endDate
    );
    if (from > to) continue;

    const activeDays = daysBetween(from, to) + 1;
    addAmount(expense.dailyAmountMinor * activeDays, expense.currency);
  }

  return { totalMinor: money(Math.round(totalMinor)), hasMissingRate };
}

/**
 * `(netMinor + fixedMonthlyMinor) / (1 - marginalRate)` — the gross monthly
 * income required so that after the fixed and marginal tax components,
 * `netMinor` remains. `marginalRateBps` is basis points (0-9999).
 */
export function grossUpForTax(
  netMinor: number,
  fixedMonthlyMinor: number,
  marginalRateBps: number
): Money {
  const marginalRate = marginalRateBps / 10000;
  return money(Math.round((netMinor + fixedMonthlyMinor) / (1 - marginalRate)));
}

/**
 * F3's "each extra 1.00 kept costs X billed" — the marginal-only gross-up
 * ratio (the fixed component isn't part of the *incremental* cost).
 */
export function costPerNetUnit(marginalRateBps: number): number {
  const marginalRate = marginalRateBps / 10000;
  return 1 / (1 - marginalRate);
}

export interface TargetRateDerivation {
  month: string;
  commitmentTotalMinor: Money;
  hasMissingRate: boolean;
  fixedMonthlyTaxMinor: Money;
  marginalRateBps: number;
  grossRequiredMinor: Money;
  billableHours: number;
  requiredHourlyRateMinor: Money | null;
  costPerNetUnit: number;
}

/**
 * F1's solve, end to end: commitments -> gross-up -> divide by billable
 * hours. `billableHours` reuses `availableWorkingHours` (C6) so the same
 * "what an hour is worth" hours figure the Money-out screen already shows
 * is the one this solve divides by. Never throws: `requiredHourlyRateMinor`
 * is `null` when `billableHours` is zero.
 */
export function solveTargetRate(
  obligations: Obligation[],
  obligationSchedules: ObligationSchedule[],
  dailyExpenses: DailyExpense[],
  incomeStreams: IncomeStream[],
  month: string,
  calendar: ScheduleCalendar,
  reportingCurrency: Currency,
  rates: FxRate[],
  onOrBefore: string,
  fixedMonthlyMinor: number,
  marginalRateBps: number
): TargetRateDerivation {
  const commitment = monthlyCommitmentTotal(
    obligations,
    obligationSchedules,
    dailyExpenses,
    month,
    calendar,
    reportingCurrency,
    rates,
    onOrBefore
  );

  const grossRequiredMinor = grossUpForTax(
    commitment.totalMinor,
    fixedMonthlyMinor,
    marginalRateBps
  );
  const billableHours = availableWorkingHours(incomeStreams, calendar, month);

  return {
    month,
    commitmentTotalMinor: commitment.totalMinor,
    hasMissingRate: commitment.hasMissingRate,
    fixedMonthlyTaxMinor: money(fixedMonthlyMinor),
    marginalRateBps,
    grossRequiredMinor,
    billableHours,
    requiredHourlyRateMinor:
      billableHours > 0
        ? money(Math.round(grossRequiredMinor / billableHours))
        : null,
    costPerNetUnit: costPerNetUnit(marginalRateBps),
  };
}
