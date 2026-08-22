/**
 * A COVERED MONTH'S TOTAL, DISBURSED (human-gate decision 1 + its refinement).
 * An hourly stream's amount depends ONLY on the working days in a calendar
 * month. A payment date is merely WHEN that already-determined total gets
 * disbursed, and may lag well behind the month it covers. There is no accrual,
 * no running total and no difference math anywhere in this file.
 *
 * LOAD-BEARING RULE: partition before filter. The group — and every sub-range
 * boundary — MUST be computed over the padded window, never over the
 * range-filtered set. Otherwise a 15th-and-month-end stream whose 15th falls
 * before range.from leaves the month-end payment alone in its group, spanning
 * 1–31 instead of 16–31, overstating it ~2×.
 */

import type { IncomeStream, IncomeSchedule } from '@/lib/horizon/income/types';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import {
  generateDates,
  coveredPeriod,
  monthBounds,
  daysInMonth,
  addDays,
} from '@/lib/horizon/schedule';
import {
  workingDaysBetween,
  monthlyIncomeForStream,
  hourlyIncomeForPeriod,
} from '@/lib/horizon/income/income-math';
import type { Money } from '@/lib/types';
import { HOURLY_GROUP_PAD_DAYS } from './types';

export interface HourlyPayment {
  date: string; // post-slippage — the date cash lands
  originalDate: string; // unslipped; everything below is derived from THIS
  scheduleId: string;
  /** 'YYYY-MM' — the calendar month this payment DISBURSES, via coveredPeriod.
   *  Both a label and the amount's sole month input. */
  period: string;
  /** The inclusive date sub-range of `period` this occurrence is paid for. For
   *  a single-schedule stream that is the whole month. */
  subFrom: string;
  subTo: string;
  /** workingDaysBetween(subFrom, subTo, calendar). */
  workingDays: number;
  amountMinor: Money; // never negative, never zero (zero -> no event)
}

/**
 * § 3d hourly income: the covered month's total, partitioned across occurrences by
 * date sub-range, and the last occurrence absorbing the remainder.
 *
 * Steps:
 *  1. Occurrences: every schedule's dates over [range.from − HOURLY_GROUP_PAD_DAYS,
 *                  range.to + HOURLY_GROUP_PAD_DAYS], UNSLIPPED.
 *  2. Covered month: period_i = coveredPeriod(u_i, r_i) on the UNSLIPPED date.
 *  3. Active window: keep iff covered month overlaps [startDate, endDate].
 *  4. Group: partition survivors by (stream.id, period_i).
 *  5. Anchor: day inside covered month for sub-range partition.
 *     For 'same': anchor_i = u_i
 *     For 'next'/'previous': anchor_i = period + '-' + min(dayOfMonth(u_i), daysInMonth(period))
 *     Order by anchor, then u_i, then scheduleId.
 *  6. Sub-period: (a_{i−1}, a_i] with first opened to month's 1st, last extended to last.
 *  7. Amount: w_i = workingDaysBetween(subFrom_i, subTo_i), raw_i = hourlyIncomeForPeriod(...).
 *     Then the MONTH-TOTAL REMAINDER RULE: let j = last occurrence with working days,
 *     amount_j = T − Σ_{i ≠ j} raw_i, others keep raw_i. Group sums EXACTLY to T.
 *  8. Date: applySlippage happens in events.ts AFTER the group is formed.
 */
export function hourlyPaymentsForStream(
  stream: Extract<IncomeStream, { kind: 'hourly' }>,
  schedules: IncomeSchedule[],
  calendar: ScheduleCalendar,
  range: { from: string; to: string }
): HourlyPayment[] {
  const padded = {
    from: addDays(range.from, -HOURLY_GROUP_PAD_DAYS),
    to: addDays(range.to, HOURLY_GROUP_PAD_DAYS),
  };

  // Step 1: Generate all occurrences on the padded window, unslipped
  interface OccurrenceRaw {
    date: string;
    scheduleId: string;
    schedule: IncomeSchedule;
  }
  const occurrences: OccurrenceRaw[] = [];
  for (const schedule of schedules) {
    const dates = generateDates(schedule, calendar, padded);
    for (const date of dates) {
      occurrences.push({ date, scheduleId: schedule.id, schedule });
    }
  }

  // Step 2: Compute covered period for each occurrence
  interface OccurrenceWithPeriod extends OccurrenceRaw {
    period: string;
  }
  const withPeriods: OccurrenceWithPeriod[] = occurrences.map((occ) => ({
    ...occ,
    period: coveredPeriod(occ.date, occ.schedule),
  }));

  // Step 3: Filter by active window (covered month overlaps stream's active window)
  const monthBoundsMap = new Map<string, { first: string; last: string }>();
  const getMBounds = (month: string) => {
    if (!monthBoundsMap.has(month)) {
      monthBoundsMap.set(month, monthBounds(month));
    }
    return monthBoundsMap.get(month)!;
  };

  const activeWindow = withPeriods.filter((occ) => {
    const bounds = getMBounds(occ.period);
    return (
      bounds.last >= stream.startDate &&
      bounds.first <= (stream.endDate ?? '9999-12-31')
    );
  });

  // Step 4 & 5: Group by (stream.id, period) and compute anchors
  const groups = new Map<string, OccurrenceWithPeriod[]>();
  for (const occ of activeWindow) {
    const key = occ.period;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(occ);
  }

  // Compute anchors and sort each group
  interface OccurrenceWithAnchor extends OccurrenceWithPeriod {
    anchor: string;
  }
  const groupsWithAnchors = new Map<string, OccurrenceWithAnchor[]>();
  for (const [periodKey, occs] of groups) {
    const period = periodKey;
    const withAnchors: OccurrenceWithAnchor[] = occs.map((occ) => {
      let anchor: string;
      if (occ.schedule.coversPeriod === 'same') {
        anchor = occ.date;
      } else {
        // 'next' or 'previous' — map day-of-month across, clamped
        const dom = parseInt(occ.date.split('-')[2], 10);
        const [yearStr, monthStr] = period.split('-');
        const maxDom = daysInMonth(
          parseInt(yearStr, 10),
          parseInt(monthStr, 10) - 1
        );
        const clampedDom = Math.min(dom, maxDom);
        anchor = `${period}-${String(clampedDom).padStart(2, '0')}`;
      }
      return { ...occ, anchor };
    });

    // Sort by anchor, then unslipped date, then scheduleId
    withAnchors.sort((a, b) => {
      if (a.anchor !== b.anchor) return a.anchor.localeCompare(b.anchor);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.scheduleId.localeCompare(b.scheduleId);
    });

    groupsWithAnchors.set(periodKey, withAnchors);
  }

  // Step 6 & 7: Sub-period partition and compute amounts
  const payments: HourlyPayment[] = [];
  const monthlyTotalMemoCache = new Map<string, Money>();

  for (const [periodKey, sortedOccs] of groupsWithAnchors) {
    const period = periodKey;
    const bounds = getMBounds(period);
    const k = sortedOccs.length;

    // Compute monthly total (memoized per streamId + period)
    const memoKey = `${stream.id}:${period}`;
    if (!monthlyTotalMemoCache.has(memoKey)) {
      const monthlyTotal = monthlyIncomeForStream(
        stream,
        schedules,
        period,
        calendar
      );
      monthlyTotalMemoCache.set(memoKey, monthlyTotal);
    }
    const monthlyTotal = monthlyTotalMemoCache.get(memoKey)!;

    // Compute sub-ranges and amounts
    const subRangeAmounts: Array<{
      index: number;
      occ: OccurrenceWithAnchor;
      subFrom: string;
      subTo: string;
      workingDays: number;
      rawAmount: Money;
    }> = [];

    for (let i = 0; i < k; i++) {
      const occ = sortedOccs[i];
      const subFrom =
        i === 0 ? bounds.first : addDays(sortedOccs[i - 1].anchor, 1);
      const subTo = i === k - 1 ? bounds.last : sortedOccs[i].anchor;

      const wd = workingDaysBetween(subFrom, subTo, calendar);
      const rawAmount = hourlyIncomeForPeriod(
        stream.hourlyRateMinor,
        stream.hoursPerDay,
        wd
      );

      subRangeAmounts.push({
        index: i,
        occ,
        subFrom,
        subTo,
        workingDays: wd,
        rawAmount,
      });
    }

    // Apply remainder rule: find last occurrence with working days
    const lastWithWorkingDays = subRangeAmounts
      .slice()
      .reverse()
      .find((x) => x.workingDays > 0);

    for (const item of subRangeAmounts) {
      let amount: number = item.rawAmount as unknown as number;

      if (lastWithWorkingDays && item.index === lastWithWorkingDays.index) {
        // Last occurrence absorbs remainder
        const sumOfOthers = subRangeAmounts
          .filter((x) => x.index !== item.index)
          .reduce((sum, x) => sum + (x.rawAmount as unknown as number), 0);
        amount = (monthlyTotal as unknown as number) - sumOfOthers;
      }

      // Skip zero-amount events
      if (amount > 0) {
        payments.push({
          date: item.occ.date,
          originalDate: item.occ.date,
          scheduleId: item.occ.scheduleId,
          period,
          subFrom: item.subFrom,
          subTo: item.subTo,
          workingDays: item.workingDays,
          amountMinor: amount as Money,
        });
      }
    }
  }

  return payments;
}
