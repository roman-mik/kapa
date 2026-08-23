/**
 * §5-D5. Four metrics with inputs and formulaKey for UI expansion.
 *
 * DIVISOR, GUARDED BY CONSTRUCTION.
 *   rangeDays     = daysBetween(from, to) + 1, which is >= 1 because §3k clamps
 *                   to >= from.
 *   monthsInRange = rangeDays / AVERAGE_DAYS_PER_MONTH (30.4375).
 * "Whole months in range" would be 0 for a sub-month range and produce
 * Infinity/NaN across three metrics; average days removes the zero divisor
 * structurally instead of guarding it after the fact.
 *
 *   monthlySurplus   = (all inflows − all outflows) / monthsInRange. INCLUDES
 *                      one-offs: this is real cash movement inside the horizon.
 *   annualEquivalent = recurringMonthlySurplus × 12, where
 *                      recurringMonthlySurplus EXCLUDES every event with
 *                      recurrence: 'oneOff' and every oneOffIn/oneOffOut event.
 *   runwayMonths     = openingTotal / |monthlySurplus| — the ALL-INCLUSIVE
 *                      surplus — and null when it is >= 0.
 *   firstNegativeDate= the first warning date, IGNORING dismissals (a dismissal
 *                      hides a banner, not a fact).
 */

import { daysBetween } from '@/lib/horizon/schedule';
import type {
  Projection,
  ProjectionOptions,
  ProjectionMetrics,
  MetricWithInputs,
} from './types';
import { AVERAGE_DAYS_PER_MONTH } from './types';
import type { IncomeStream } from '@/lib/horizon/income/types';

/**
 * §5-E3. Blended hourly rate (reporting currency) that would zero
 * monthlySurplus over the horizon, holding hours and every other event
 * fixed.
 *
 * `hours` are recovered per hourlyDerived event as
 * `amountMinor (native) / hourlyRateMinor (native)` — currency-agnostic,
 * since both sides are in the stream's own currency — then the blended rate
 * is computed in the REPORTING currency using `convertedMinor`:
 *
 *   currentHourlyIncome = sum(convertedMinor) over hourlyDerived events
 *   totalHours           = sum(amountMinor / stream.hourlyRateMinor)
 *   blendedRate           = currentHourlyIncome / totalHours
 *   neededHourlyIncome    = currentHourlyIncome - monthlySurplus*monthsInRange
 *   breakEvenRate          = neededHourlyIncome / totalHours
 *
 * Null when there is no hourly-derived income in range (nothing to solve
 * for) or when the household's hourly streams have been deleted since the
 * event was generated.
 */
function breakEvenRate(
  projection: Projection,
  streams: readonly IncomeStream[],
  monthlySurplus: number,
  monthsInRange: number
): MetricWithInputs<number | null> {
  const rateByStreamId = new Map<string, number>();
  for (const stream of streams) {
    if (stream.kind === 'hourly') rateByStreamId.set(stream.id, stream.hourlyRateMinor);
  }

  let currentHourlyIncomeMinor = 0;
  let totalHours = 0;

  for (const event of projection.events) {
    if (event.derivation !== 'hourlyDerived' || event.unconvertible) continue;
    const rate = rateByStreamId.get(event.sourceId);
    if (!rate) continue;
    currentHourlyIncomeMinor += event.convertedMinor ?? 0;
    totalHours += event.amountMinor / rate;
  }

  const value =
    totalHours > 0
      ? Math.round(
          (currentHourlyIncomeMinor - monthlySurplus * monthsInRange) /
            totalHours
        )
      : null;

  return {
    value,
    inputs: {
      currentHourlyIncomeMinor,
      totalHours: totalHours.toFixed(2),
      monthlySurplusMinor: Math.round(monthlySurplus),
      monthsInRange: monthsInRange.toFixed(2),
    },
    formulaKey: 'projection.metrics.breakEvenRate',
    caveatKey: totalHours === 0 ? 'noHourlyIncome' : null,
  };
}

export function projectionMetrics(
  projection: Projection,
  options: ProjectionOptions,
  streams: readonly IncomeStream[] = []
): ProjectionMetrics {
  const rangeDays = daysBetween(options.from, options.to) + 1;
  const monthsInRange = rangeDays / AVERAGE_DAYS_PER_MONTH;

  // Calculate total inflows and outflows, separating one-offs
  let totalInflow = 0;
  let totalOutflow = 0;
  let recurringInflow = 0;
  let recurringOutflow = 0;
  let excludedOneOffInflowMinor = 0;
  let excludedOneOffOutflowMinor = 0;
  let excludedOneOffCount = 0;

  for (const event of projection.events) {
    if (event.unconvertible) continue;

    const isOneOff =
      event.recurrence === 'oneOff' ||
      event.kind === 'oneOffIn' ||
      event.kind === 'oneOffOut';
    const amount = event.convertedMinor ?? 0;

    if (amount > 0) {
      totalInflow += amount;
      if (!isOneOff) {
        recurringInflow += amount;
      } else {
        excludedOneOffInflowMinor += amount;
        excludedOneOffCount++;
      }
    } else if (amount < 0) {
      totalOutflow += amount;
      if (!isOneOff) {
        recurringOutflow += amount;
      } else {
        excludedOneOffOutflowMinor += amount;
        excludedOneOffCount++;
      }
    }
  }

  const monthlySurplus = (totalInflow + totalOutflow) / monthsInRange;
  const recurringMonthlySurplus =
    (recurringInflow + recurringOutflow) / monthsInRange;

  const monthlySurplusMinor: MetricWithInputs<number> = {
    value: Math.round(monthlySurplus),
    inputs: {
      totalInflowMinor: totalInflow,
      totalOutflowMinor: totalOutflow,
      rangeDays,
      eventDays: rangeDays - 1, // day-0 convention: today's events excluded
      monthsInRange: monthsInRange.toFixed(2),
    },
    formulaKey: 'projection.metrics.monthlySurplus',
    caveatKey: rangeDays < 28 ? 'shortRange' : null,
  };

  const annualEquivalentMinor: MetricWithInputs<number> = {
    value: Math.round(recurringMonthlySurplus * 12),
    inputs: {
      recurringInflowMinor: recurringInflow,
      recurringOutflowMinor: recurringOutflow,
      excludedOneOffInflowMinor,
      excludedOneOffOutflowMinor,
      excludedOneOffCount,
      monthsInRange: monthsInRange.toFixed(2),
    },
    formulaKey: 'projection.metrics.annualEquivalent',
    caveatKey: rangeDays < 28 ? 'shortRange' : null,
  };

  const runwayValue =
    monthlySurplus >= 0
      ? null
      : Math.round(projection.openingTotalMinor / Math.abs(monthlySurplus));

  const runwayMonths: MetricWithInputs<number | null> = {
    value: runwayValue,
    inputs: {
      openingTotalMinor: projection.openingTotalMinor,
      monthlySurplusMinor: Math.round(monthlySurplus),
      note: 'uses all-inclusive surplus (asymmetry with annualEquivalent intentional)',
    },
    formulaKey: 'projection.metrics.runwayMonths',
    caveatKey: rangeDays < 28 ? 'shortRange' : null,
  };

  const firstNegativeDate: MetricWithInputs<string | null> = {
    value: projection.dailyBalances.some((db) => db.totalMinor < 0)
      ? (projection.dailyBalances.find((db) => db.totalMinor < 0)?.date ?? null)
      : null,
    inputs: {
      totalDays: projection.dailyBalances.length,
    },
    formulaKey: 'projection.metrics.firstNegativeDate',
    caveatKey: null,
  };

  return {
    monthlySurplusMinor,
    annualEquivalentMinor,
    runwayMonths,
    firstNegativeDate,
    breakEvenRateMinor: breakEvenRate(
      projection,
      streams,
      monthlySurplus,
      monthsInRange
    ),
  };
}
