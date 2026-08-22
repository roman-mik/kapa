/**
 * Build projection events from all entity types: income, obligations,
 * daily expenses, one-offs. One pass per entity — never a per-day rescan.
 *
 * GENERATE ON A PADDED WINDOW, THEN FILTER ON THE LANDED DATE.
 * Per entity the generation range is clamped by startDate/endDate
 * (evaluated on the UNSLIPPED date), then dates are slipped and filtered
 * on the LANDED date into (today, to].
 *
 * Duplicate suppression: dedup on (sourceId, scheduleId, originalDate).
 * Zero-amount events are not emitted.
 */

import type {
  ProjectionInputs,
  ProjectionOptions,
  ProjectionEvent,
} from './types';
import { SLIPPAGE_PAD_DAYS } from './types';
import {
  generateDates,
  applySlippage,
  addDays,
  coveredPeriod,
  daysInMonth,
} from '@/lib/horizon/schedule';
import {
  chargeDates,
  chargeAmount,
} from '@/lib/horizon/spending/spending-math';
import { hourlyPaymentsForStream } from './hourly';
import type { IncomeStream } from '@/lib/horizon/income/types';

export function buildProjectionEvents(
  inputs: ProjectionInputs,
  options: ProjectionOptions
): ProjectionEvent[] {
  const { from, to, today } = options;

  // Step 1: Filter archived entities
  const liveAccounts = inputs.accounts.filter((a) => !a.archived);
  const liveStreams = inputs.streams.filter((s) => !s.archived);
  const liveObligations = inputs.obligations.filter((o) => !o.archived);
  const liveDailyExpenses = inputs.dailyExpenses.filter((d) => !d.archived);
  const liveOneOffs = inputs.oneOffs; // OneOffEvent has no archived column

  // Build a set of live account IDs for quick lookup
  const liveAccountIds = new Set(liveAccounts.map((a) => a.id));

  const events: ProjectionEvent[] = [];
  const occurrenceIndexBySource = new Map<string, number>();

  // Helper to increment and get occurrence index
  const nextOccurrenceIndex = (sourceId: string): number => {
    const current = occurrenceIndexBySource.get(sourceId) ?? 0;
    occurrenceIndexBySource.set(sourceId, current + 1);
    return current;
  };

  // Helper to clamp range by startDate/endDate
  const clampRangeByEntity = (
    entityFrom: string | undefined,
    entityTo: string | undefined,
    padAmount: number
  ) => {
    const paddedFrom = addDays(from, -padAmount);
    const paddedTo = addDays(to, padAmount);
    return {
      from: entityFrom && entityFrom > paddedFrom ? entityFrom : paddedFrom,
      to: entityTo && entityTo < paddedTo ? entityTo : paddedTo,
    };
  };

  // Helper to add event if it's valid and not zero-amount
  const addEvent = (eventData: Omit<ProjectionEvent, 'occurrenceIndex'>) => {
    // Check for zero amount
    if (eventData.amountMinor === 0) return;

    // Check if account exists and is live
    if (!liveAccountIds.has(eventData.accountId)) return;

    // Add the event with occurrence index
    events.push({
      ...eventData,
      occurrenceIndex: nextOccurrenceIndex(eventData.sourceId),
    });
  };

  // Income streams
  for (const stream of liveStreams) {
    if (stream.kind === 'hourly') {
      // Hourly income: use hourlyPaymentsForStream
      const schedules = inputs.incomeSchedules.filter(
        (s) => s.incomeStreamId === stream.id
      );
      const hourlyPayments = hourlyPaymentsForStream(
        stream as Extract<IncomeStream, { kind: 'hourly' }>,
        schedules,
        inputs.calendar,
        { from, to }
      );

      for (const payment of hourlyPayments) {
        const landed = applySlippage(
          payment.originalDate,
          inputs.calendar,
          schedules.find((s) => s.id === payment.scheduleId)?.slippagePolicy ||
            'none'
        );

        // Filter on landed date into (today, to]
        if (!(landed > today && landed <= to)) continue;

        addEvent({
          date: landed,
          originalDate: payment.originalDate,
          shifted: landed !== payment.originalDate,
          kind: 'income',
          label: stream.name,
          sourceId: stream.id,
          scheduleId: payment.scheduleId,
          amountMinor: payment.amountMinor,
          currency: stream.currency,
          accountId: stream.accountId,
          convertedMinor: null,
          unconvertible: false,
          recurrence: stream.recurrence,
          confidence: stream.confidence,
          derivation: 'hourlyDerived',
          coveredPeriod: payment.period,
          balanceBeforeMinor: 0,
          balanceAfterMinor: 0,
        });
      }
    } else {
      // Flat income (fixed or variable)
      const schedules = inputs.incomeSchedules.filter(
        (s) => s.incomeStreamId === stream.id
      );
      const range = clampRangeByEntity(
        stream.startDate,
        stream.endDate ?? undefined,
        SLIPPAGE_PAD_DAYS
      );

      for (const schedule of schedules) {
        const dates = generateDates(schedule, inputs.calendar, range);

        for (const unslipped of dates) {
          const landed = applySlippage(
            unslipped,
            inputs.calendar,
            schedule.slippagePolicy
          );

          // Filter on landed date into (today, to]
          if (!(landed > today && landed <= to)) continue;

          addEvent({
            date: landed,
            originalDate: unslipped,
            shifted: landed !== unslipped,
            kind: 'income',
            label: stream.name,
            sourceId: stream.id,
            scheduleId: schedule.id,
            amountMinor: stream.fixedAmountMinor,
            currency: stream.currency,
            accountId: stream.accountId,
            convertedMinor: null,
            unconvertible: false,
            recurrence: stream.recurrence,
            confidence: stream.confidence,
            derivation: 'entered',
            coveredPeriod: coveredPeriod(unslipped, schedule),
            balanceBeforeMinor: 0,
            balanceAfterMinor: 0,
          });
        }
      }
    }
  }

  // Obligations
  for (const obligation of liveObligations) {
    const schedules = inputs.obligationSchedules.filter(
      (s) => s.obligationId === obligation.id
    );
    const range = clampRangeByEntity(
      obligation.startDate,
      obligation.endDate ?? undefined,
      SLIPPAGE_PAD_DAYS
    );

    for (const schedule of schedules) {
      const dates = generateDates(schedule, inputs.calendar, range);

      for (const unslipped of dates) {
        const landed = applySlippage(
          unslipped,
          inputs.calendar,
          schedule.slippagePolicy
        );

        // Filter on landed date into (today, to]
        if (!(landed > today && landed <= to)) continue;

        addEvent({
          date: landed,
          originalDate: unslipped,
          shifted: landed !== unslipped,
          kind: 'obligation',
          label: obligation.name,
          sourceId: obligation.id,
          scheduleId: schedule.id,
          amountMinor: -obligation.amountMinor as typeof obligation.amountMinor,
          currency: obligation.currency,
          accountId: obligation.accountId,
          convertedMinor: null,
          unconvertible: false,
          recurrence: obligation.recurrence,
          confidence: obligation.confidence,
          derivation: 'entered',
          coveredPeriod: coveredPeriod(unslipped, schedule),
          balanceBeforeMinor: 0,
          balanceAfterMinor: 0,
        });
      }
    }
  }

  // Daily expenses
  for (const expense of liveDailyExpenses) {
    const range = clampRangeByEntity(
      expense.startDate,
      expense.endDate ?? undefined,
      SLIPPAGE_PAD_DAYS
    );
    const chargeDatesList = chargeDates(expense, range);

    for (const date of chargeDatesList) {
      // Daily expenses have no slippage — no calendar argument to chargeDates

      // Filter on date into (today, to]
      if (!(date > today && date <= to)) continue;

      // Calculate the days covered by this charge based on cadence
      let periodDays: number;
      if (expense.chargeCadence === 'daily') {
        periodDays = 1;
      } else if (expense.chargeCadence === 'weekly') {
        periodDays = 7;
      } else {
        // monthly: days in the month containing this date
        const yearStr = date.slice(0, 4);
        const monthStr = date.slice(5, 7);
        periodDays = daysInMonth(
          parseInt(yearStr, 10),
          parseInt(monthStr, 10) - 1
        );
      }

      // For daily cadence, derivation is 'entered' (the amount is just daily × 1)
      // For weekly/monthly, it's 'accrualCharge'
      const amount = chargeAmount(
        expense.dailyAmountMinor,
        expense.chargeCadence,
        periodDays
      );

      addEvent({
        date,
        originalDate: date,
        shifted: false,
        kind: 'dailyExpense',
        label: expense.name,
        sourceId: expense.id,
        scheduleId: null,
        amountMinor: -(amount as unknown as number) as typeof amount,
        currency: expense.currency,
        accountId: expense.accountId,
        convertedMinor: null,
        unconvertible: false,
        recurrence: 'recurring',
        confidence: 'confirmed',
        derivation:
          expense.chargeCadence === 'daily' ? 'entered' : 'accrualCharge',
        coveredPeriod: null,
        balanceBeforeMinor: 0,
        balanceAfterMinor: 0,
      });
    }
  }

  // One-offs
  for (const oneOff of liveOneOffs) {
    const date = oneOff.date;

    // Filter on date into (today, to]
    if (!(date > today && date <= to)) continue;

    const isInflow = oneOff.direction === 'in';
    const kind = isInflow ? 'oneOffIn' : 'oneOffOut';

    addEvent({
      date,
      originalDate: date,
      shifted: false,
      kind,
      label: oneOff.name,
      sourceId: oneOff.id,
      scheduleId: null,
      amountMinor: isInflow
        ? oneOff.amountMinor
        : (-oneOff.amountMinor as typeof oneOff.amountMinor),
      currency: oneOff.currency,
      accountId: oneOff.accountId,
      convertedMinor: null,
      unconvertible: false,
      recurrence: 'oneOff',
      confidence: 'confirmed',
      derivation: 'entered',
      coveredPeriod: null,
      balanceBeforeMinor: 0,
      balanceAfterMinor: 0,
    });
  }

  // De-duplicate on (sourceId, scheduleId, originalDate)
  const seen = new Set<string>();
  const deduped: ProjectionEvent[] = [];
  for (const event of events) {
    const key = `${event.sourceId}:${event.scheduleId ?? ''}:${event.originalDate}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(event);
    }
  }

  return deduped;
}
