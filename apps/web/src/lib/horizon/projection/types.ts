/**
 * Horizon projection types: the pure engine's input and output types.
 * These are computed, not stored, except for dismissals (slice 4).
 *
 * SPLIT ACROSS SLICES (knip — critique M7): nothing lands before its consumer.
 * Slice 2: all event and balance types.
 * Slice 3: metrics, warnings, and dismissals.
 */

import type { Currency, Money } from '@/lib/types';
import type { Confidence, Recurrence } from '@/lib/horizon/types';
import type { ScheduleCalendar } from '@/lib/horizon/schedule';
import type { HorizonAccount } from '@/lib/horizon/types';
import type { IncomeStream, IncomeSchedule } from '@/lib/horizon/income/types';
import type {
  Obligation,
  ObligationSchedule,
  DailyExpense,
  OneOffEvent,
} from '@/lib/horizon/spending/types';
import type { FxRate } from '@/lib/horizon/types';

/** Slippage can move a date across a contiguous run of non-working days. The
 *  worst realistic run is a New-Year holiday block plus two adjacent weekends
 *  (~14 days), so 31 is a generous, stated bound. */
export const SLIPPAGE_PAD_DAYS = 31;

/** Hourly income is generated on a wider window than SLIPPAGE_PAD_DAYS, for a
 *  different reason: GROUP COMPLETENESS. Every occurrence covering month M lies
 *  in [first day of M−1, last day of M+1] — those are the only three cases
 *  coveredPeriod can produce — a span of at most 92 days. So if any member of a
 *  covered-month group lands in range, every other member is inside this window
 *  and the sub-range partition is computed correctly. This is a PROOF, unlike
 *  revision 1's HOURLY_LOOKBACK_DAYS = 400, which was an asserted bound with a
 *  documented failure mode. */
export const HOURLY_GROUP_PAD_DAYS = 92;

const EVENT_KINDS = [
  'income',
  'oneOffIn',
  'obligation',
  'dailyExpense',
  'oneOffOut',
] as const;
type ProjectionEventKind = (typeof EVENT_KINDS)[number];

export interface ProjectionEvent {
  /** The date cash actually moves — post-slippage, and the date this event was
   *  filtered into [from, to] on. Never the covered period. */
  date: string;
  /** The unslipped generated date; equals `date` when nothing shifted. This is
   *  the date startDate/endDate were evaluated against. */
  originalDate: string;
  shifted: boolean;
  kind: ProjectionEventKind;
  label: string; // the entity name; the UI adds i18n framing
  sourceId: string; // stream / obligation / expense / one-off id
  scheduleId: string | null; // null for daily expenses and one-offs
  occurrenceIndex: number; // nth occurrence of this source in the range
  /** Signed, in the SOURCE entity's own currency. Inflows positive. Never zero:
   *  zero-amount events are not emitted at all (§3c step 4). */
  amountMinor: Money;
  currency: Currency;
  accountId: string;
  /** Signed, converted into the reporting currency, or null when unconvertible. */
  convertedMinor: number | null;
  /** True when no FX rate covers a hop. The event is still returned (§2-D14/G1)
   *  and is excluded from balances rather than silently dropped; on such an
   *  event balanceBeforeMinor === balanceAfterMinor — not null, which would
   *  force every consumer to branch. */
  unconvertible: boolean;
  recurrence: Recurrence; // §2-D7 — never inferred, always carried
  confidence: Confidence; // §2-D8/G1
  /** §2-D14: distinguishes an amount the engine DERIVED from one the user
   *  ENTERED. Rendered as a text badge beside the confidence badge. */
  derivation: 'entered' | 'hourlyDerived' | 'accrualCharge';
  coveredPeriod: string | null; // 'YYYY-MM' — a LABEL, never a cash date
  /** Reporting-currency running totals, stamped during the sweep. §5-D1's
   *  acceptance criteria and §5-D4's "running balance between same-day events". */
  balanceBeforeMinor: number;
  balanceAfterMinor: number;
}

export interface AccountDayBalance {
  accountId: string;
  /** The account's own currency — never rewritten (§2-D15). */
  balanceMinor: Money;
  /** In the reporting currency, or null when no rate covers it. */
  convertedMinor: number | null;
  /** Both fields added per round-2 critique M3: negativeDays(projection) could
   *  not otherwise implement its own trigger. Non-includeInTotal accounts ARE
   *  present here (they are merely excluded from totalMinor), so without this
   *  flag the warning fires on accounts it shouldn't. The table view and the
   *  account-scoped suggestions (M2) both need them anyway. */
  includeInTotal: boolean;
  currency: Currency;
}

export interface DailyBalance {
  date: string;
  /** Sum of convertible, includeInTotal, non-archived accounts, reporting currency. */
  totalMinor: number;
  accounts: AccountDayBalance[];
}

/** §2-D2 made structural: there is no month-end-only array anywhere in this
 *  module's public surface, so month-end cannot be rendered alone without
 *  inventing a new type. Cf. Epic C §2c — enforced by omission, not by a rule. */
export interface MonthPair {
  month: string; // 'YYYY-MM'
  end: { date: string; balanceMinor: number };
  /** The earliest day in the month attaining the minimum, and its balance. */
  minimum: { date: string; balanceMinor: number };
  /** True for a first/last month truncated by the range. Kept, never dropped —
   *  excluding it would hide a month — and `end.date` is the last IN-RANGE day,
   *  which the UI labels so a 12-day stub isn't read as a month end. */
  partial: boolean;
}

/** Archived accounts, streams, obligations and daily expenses ARE ACCEPTED AND
 *  IGNORED — projectCashflow filters them at one choke point, so a caller
 *  cannot get it wrong either way. OneOffEvent has no `archived` column. */
export interface ProjectionInputs {
  accounts: HorizonAccount[];
  streams: IncomeStream[];
  incomeSchedules: IncomeSchedule[];
  obligations: Obligation[];
  obligationSchedules: ObligationSchedule[];
  dailyExpenses: DailyExpense[];
  oneOffs: OneOffEvent[];
  rates: FxRate[];
  calendar: ScheduleCalendar;
}

export interface ProjectionOptions {
  /** Inclusive, YYYY-MM-DD. PRECONDITION: from >= today (parseProjectionRange
   *  guarantees it). The engine clamps defensively rather than throwing —
   *  from = max(from, today), to = max(to, from) — so its contract is total. */
  from: string;
  to: string; // inclusive
  /** Injected, never read from the clock (§7). Every conversion is pinned to it.
   *  DAY-0 CONVENTION (human-gate decision 3): each account's
   *  currentBalanceMinor is treated as the balance at the END of `today`, so
   *  every event dated `today` is assumed already settled and is NOT projected
   *  again — events are filtered into (today, to]. dailyBalances still covers
   *  [from, to] inclusive with no gaps, and dailyBalances[0] closes at exactly
   *  openingTotalMinor. Labelled on screen, not left implicit. */
  today: string;
  reportingCurrency: Currency;
  order: readonly ProjectionEventKind[];
}

export interface Projection {
  dailyBalances: DailyBalance[]; // one per calendar day in [from, to], no gaps
  events: ProjectionEvent[]; // sorted; see projection.ts's comparator
  monthPoints: MonthPair[];
  openingTotalMinor: number;
  hasMissingRate: boolean;
  missingRates: { from: Currency; to: Currency }[];
  oldestRateAsOfDate: string | null;
}

/** SLICE 3: metrics, warnings, dismissals
 *
 *  All types below are consumed by metrics.ts and warnings.ts, which are only
 *  available in slice 3. They are declared here (not in those modules) to keep
 *  the single type home principle and to avoid import cycles. */

/** Average days per month: 365.25 / 12. Used in metric divisors.
 *  Slice 3, consumed by metrics.ts. */
export const AVERAGE_DAYS_PER_MONTH = 30.4375;

/** Which pot a suggestion targets: the reporting-currency total, or a specific
 *  account's balance in its own currency. For an account-triggered day, the
 *  minima are computed over that account's own series, and candidate events
 *  are restricted to that account's own events (critique M2). */
export type SuggestionScope =
  | { kind: 'total' }
  | { kind: 'account'; accountId: string; currency: Currency };

/** Every variant carries a deterministic id used for ranking tie-breaks and as
 *  the React key: `${kind}:${negDate}:${sourceId ?? 'none'}:${refDate ?? 'none'}`.
 *  All three suggestion algorithms operate on prefix/suffix minima of the daily
 *  series and have exact, O(D) implementations (no re-sweep, no approximation). */
export type Suggestion =
  | {
      kind: 'shiftPayment';
      id: string;
      scope: SuggestionScope;
      sourceId: string;
      eventLabel: string;
      eventDate: string;
      amountMinor: number;
      /** The earliest date d > d0 with min(series[t] + |A|, t ∈ [d0, d−1]) ≥ 0.
       *  null means no landing date inside the horizon clears the run (critique M4). */
      suggestedDate: string | null;
    }
  | {
      kind: 'bringForward';
      id: string;
      scope: SuggestionScope;
      sourceId: string;
      eventLabel: string;
      eventDate: string;
      amountMinor: number;
      /** The FIRST day of the negative run this would clear (critique N-h). */
      toDate: string;
    }
  | {
      kind: 'holdBack';
      id: string;
      scope: SuggestionScope;
      amountMinor: number;
      /** The nearest convertible inflow at or before negDate, or null when
       *  there is none. "Hold this back out of whatever arrives" is still
       *  actionable advice and is what makes this a total function (critique M6). */
      from: { label: string; date: string; sourceId: string } | null;
    };

/** Configuration for suggestion algorithms. Slice 3, consumed by warnings.ts. */
export interface SuggestionOptions {
  /** How far back shiftPayment looks for a movable outflow. Default 3: a
   *  payment can usually be nudged a few days without renegotiating anything,
   *  and §5-D3 asks for the NEAREST fix. Beyond ~3 days it stops being a nudge.
   *  A field, not a literal buried in the function, so it tunes in one place. */
  shiftWindowDays: number;
}

/** A single day where the household (or a specific account) closes negative.
 *  The trigger field distinguishes which. Suggestions are computed once per
 *  maximal negative run and shared by every day in it (critique N-h). */
export interface NegativeDay {
  date: string;
  /** Positive magnitude of the worse of the two triggers. */
  shortfallMinor: number;
  /** Normally the reporting currency. When ONLY the account trigger fired and
   *  that account's convertedMinor is null (no rate), this is the offending
   *  account's own currency and shortfallMinor is its native shortfall
   *  (critique N-h). */
  shortfallCurrency: Currency;
  /** Which condition fired (critique N1). */
  trigger: 'total' | 'account' | 'both';
  /** Live includeInTotal accounts closing negative in their own currency. An
   *  account whose OPENING balance is already negative is excluded: a deliberate
   *  overdraft would otherwise warn on every day of the horizon, dismissible one
   *  date at a time (critique N-h). */
  negativeAccountIds: string[];
  /** 1-3 by construction — one per variant, never a runtime slice. Advisory
   *  only: nothing here mutates anything. */
  suggestions: Suggestion[];
  dismissed: boolean;
  dismissedReason: string | null;
}

/** Durable dismissal of a negative-day warning. Stored in
 *  horizon_projection_dismissals (migration 0022, slice 4). A dismissal
 *  suppresses only while the shortfall is no worse and the reporting currency
 *  is unchanged — otherwise a worsening shortfall or currency change
 *  re-surfaces it. */
export interface ProjectionDismissal {
  id: string;
  negativeDate: string;
  /** Positive magnitude at dismissal time. Stored so a worsening shortfall
   *  re-surfaces instead of staying hidden. */
  shortfallMinor: Money;
  currency: Currency;
  reason: string;
  createdAt: string;
}

/** A metric with its derivation shown. Each metric carries inputs and a
 *  formulaKey so the UI can expand to show the formula and its assumptions
 *  as data, not hardcoded prose (§5-D5/G2). */
export interface MetricWithInputs<T> {
  value: T;
  /** Raw numbers and field names used in the formula. */
  inputs: Record<string, number | string | null>;
  /** An i18n key naming the formula. */
  formulaKey: string;
  /** 'shortRange' when rangeDays < 28, else null — a 10-day extrapolation
   *  is labelled rather than presented as fact. */
  caveatKey: string | null;
}

/** The four headline metrics for the projection: monthly and annual surplus,
 *  runway, and the first date a warning fires. Slice 3, consumed by metrics.ts. */
export interface ProjectionMetrics {
  monthlySurplusMinor: MetricWithInputs<number>;
  annualEquivalentMinor: MetricWithInputs<number>;
  runwayMonths: MetricWithInputs<number | null>;
  firstNegativeDate: MetricWithInputs<string | null>;
}
