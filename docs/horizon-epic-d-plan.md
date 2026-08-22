# Horizon Epic D — Projection engine

**Status:** planned, not started · **Spec:** `docs/horizon-user-stories.md` §5 Epic D · **Plan of record:** `PLAN.md` §9

**Notation.** `horizon-user-stories.md` numbers **domain rules D1–D15 in §2** and **Epic D stories
D1–D6 in §5**. This plan writes domain rules as **`§2-D<n>`** and stories as **`§5-D<n>`**
throughout, so `§2-D7` (recurrence is never inferred) is never confused with `§5-D4` (same-day
ordering).

**Source of truth:** `.claude/workflow/horizon-epic-d/02-spec.md` (**revision 2**). This document is
its propagation into the plan of record; where the two ever disagree, the spec wins.

**Revision 2 (2026-08-22) — the hourly model was replaced at the human gate.** The cumulative
working-day accrual model of revision 1 is **rejected and removed**. An hourly stream's amount
depends only on the working days in a calendar month; a payment date is merely when that month's
total is disbursed, and may lag the month it covers. `coveredPeriod` picks the month; where several
of a stream's schedules cover the same month, the month's **working days** are partitioned across
them by date sub-range and each occurrence is paid `rate × hoursPerDay × workingDaysInItsSubRange`,
with the last occurrence absorbing the remainder so the month sums exactly to
`monthlyIncomeForStream`. Gone: `H(cum_i) − H(cum_{i−1})`, the monotone `max()` clamp, `cum_0`,
`HOURLY_LOOKBACK_DAYS = 400`, `shiftMonthKeepingDay` and cut dates. Also folded in: events dated
`today` are excluded from the sweep (decision 3), and the round-2 critique's M2–M7 as binding
implementation constraints.

---

## 1. Context

Epic A (accounts, reporting currency, FX snapshots), Epic B (income streams, the work calendar, the
pure schedule engine) and Epic C (obligations, daily-accrual expenses, one-off events) are shipped.
Between them they describe *what exists* and *what moves*. None of them answers the question the
product was built for: **on which specific day does this stop working?** Epic D is that answer — a
pure, deterministic projection engine that walks the four input models day by day over a chosen
horizon, plus the Timeline screen that renders it.

`/horizon/timeline` is still `HorizonPlaceholder` (`apps/web/src/app/horizon/timeline/page.tsx`).
`HorizonRail.tsx` already links it, so this epic replaces a placeholder rather than adding nav.
Note that the placeholder page calls only `verifySession` and never `getHouseholdId` — the real
page must add it, as `/horizon` and `/horizon/money-out` already do.

Epic C left one thing pointing straight here: `account_id` was added to daily expenses and one-off
events *specifically* "because Epic D needs to know which account drains for the projection to be
dated against a real balance" (Epic C §1). This is that consumer.

**Scope for this pass: `§5-D1`–`§5-D5` `[MVP]` only.** **`§5-D6` `[P2]` — the sequenced transition
view — is deferred**, the same way Epic B deferred B5 and for the same structural reason: a
"transition" is defined in `horizon-user-stories.md` §3 as a group of dated one-offs hanging off a
`ScenarioDiff`, and `Scenario` doesn't exist until Epic E. Building it now means inventing a
grouping entity Epic E would immediately replace.

**Decisions taken (this session):**

| Question | Decision |
|---|---|
| Scope | `§5-D1`–`§5-D5` `[MVP]`. `§5-D6` `[P2]` deferred to Epic E, where `Scenario`/`ScenarioDiff` make a "transition" representable |
| Hourly per-pay-date amount | **A covered month's total, disbursed — human-gate decision 1** (§3d). `coveredPeriod(unslippedDate, rule)` picks the calendar month; where several of a stream's schedules cover that month, the month's **working days** are partitioned by date sub-range (1st–15th, 16th–end) and each occurrence is paid `hourlyIncomeForPeriod(rate, hoursPerDay, workingDaysInSubRange)` — `§2-D9` applied literally. The **month-total remainder rule** anchors the group to `monthlyIncomeForStream` so it sums exactly. No accrual, no running total, no difference math, and **no division of money**. Revision 1's cumulative accrual and round 1's even money split are both rejected — see §3d |
| Money-in divergence | **Mostly gone; what remains is accepted and stated.** §3d calls `monthlyIncomeForStream` itself, so for any covered month with at least one occurrence the Timeline's disbursements sum to Money-in's figure **exactly**. What remains is timing and coverage, not computation: a month no occurrence covers is never disbursed (open question Q1b), and `coversPeriod: 'next'`/`'previous'` shifts a month's income to the payment that covers it. Partial months now **agree** on both screens. Reconciling the two screens is a logged follow-up, not this epic |
| Slippage vs the range edge | **Generate on a padded window `[from − 31d, to + 31d]`, apply slippage, then filter on the LANDED date.** `startDate`/`endDate` are evaluated against the **unslipped** date — the due date is what the active window governs; slippage is a banking artefact applied afterwards. Hourly income uses the wider `HOURLY_GROUP_PAD_DAYS = 92`, for group completeness rather than slippage, and §3d proves that bound |
| Hourly amounts vs slippage | **Provably independent.** The amount is a function of `(rate, hoursPerDay, covered month, calendar, the group's anchor days)` — all derived from the **unslipped** date. Slippage decides only the event's `date`. Round 2's M1 bug (a baseline anchored on the unslipped date while the filter used the landed date) is structurally unrepresentable because there is no baseline |
| Events dated `today` | **Excluded from the sweep — human-gate decision 3.** They are already reflected in the opening balance the user typed in. `dailyBalances` still covers `[from, to]` inclusive with no gaps; events are filtered into `(today, to]`. Labelled on screen, not left implicit |
| Archived entities | Filtered **at one choke point** — inside `projectCashflow`, before anything else. Queries keep returning everything, because list screens legitimately show archived rows. Archived accounts contribute no opening balance and no `AccountDayBalance` row regardless of `includeInTotal`. **`OneOffEvent` has no `archived` column**, so there is nothing to filter there |
| Range vs opening balance | **`from` is clamped to `today`**, so the opening balance is coherent by construction rather than by a second sweep over `[today, from)`. Full URL-parameter validation lives in `parseProjectionRange` at the page layer (§3k) |
| `§5-D3` dismissal persistence | A new table, `horizon_projection_dismissals` (migration 0022). There is no client-side persistence anywhere in this repo, and "dismissed **with a reason**" is user-authored text |
| Dismissal key + re-surfacing | `unique (household_id, negative_date)`, storing `shortfall_minor` and `currency` at dismissal time. A dismissal suppresses only while the shortfall is no worse and the reporting currency is unchanged. `dismissNegativeDay` also deletes rows whose `negative_date < today` |
| Warning trigger | **Either** the reporting total closes negative **or** any live `includeInTotal` account closes negative in its own currency. Accounts are not fungible: `§2-D2`'s motivating scenario is a +200,000 total hiding a −124,600 personal account. One warning stream, keyed on the date, so the dismissal key does not multiply. An account whose **opening** balance is already negative does not fire the account trigger — otherwise a deliberate overdraft warns on all 365 days |
| Suggestion scope | Every `Suggestion` carries `scope: total \| account`. An account-triggered day's suggestions are computed over **that account's own daily series in its own currency**, with candidates restricted to that account's events. Revision 1 ran every algorithm over the reporting total, which produced confident, precise, wrong advice for exactly the case the account trigger was added to catch (round-2 critique M2) |
| Suggestion unit | Computed once per negative **run** and shared by every day in it, not recomputed per day — otherwise day 3 of a 5-day run gets advice that leaves days 1–2 negative |
| `§5-D4` "transfers" | **Dropped from the configurable categories.** No transfer entity exists and nothing in the codebase can produce a transfer event. Epic B dropped multi-calendar and Epic C dropped `coversPeriod` on `everyNDays`/`oneOff` on precisely this reasoning |
| One-off events in the ordering | Their own two explicit slots, `oneOffIn` and `oneOffOut`, split by the existing `direction` column — not folded into `income`/`obligation` |
| Order storage | A single `households.horizon_event_order` text column, the `horizon_reporting_currency` pattern (0014's add-nullable → backfill → not-null+default+check). The engine still takes the order as an **argument** — it never reads settings |
| Currency model | Per account, in native currency, summed into the reporting currency **per day**. `today.ts`'s `summarizeToday` is the precedent: convert per account, never convert the total (`§2-D15`) |
| FX pinning | Every conversion in one projection is pinned to a single injected `asOfDate` (always `today`), not to each event's own date. Per-event pinning would break `§2-D11`'s reproducibility the moment the rates table grows |
| Missing rates | Flagged, never thrown — `hasMissingRate` plus an `unconvertible` event that still appears in the list, with `balanceBeforeMinor === balanceAfterMinor` |
| Derived vs entered amounts | `ProjectionEvent.derivation: 'entered' \| 'hourlyDerived' \| 'accrualCharge'`, rendered as a text badge beside `confidence`. `'entered'` also covers `chargeCadence: 'daily'` expenses, whose "lump" is the number the user typed; `'accrualCharge'` is reserved for the weekly and monthly cadences. `§2-D14` says every estimated value is flagged |
| Duplicate suppression | Dedup on **`(sourceId, scheduleId, originalDate)`**, which can only collide if one schedule produced a date twice. Revision 1 keyed on `(sourceId, originalDate)` and kept the lowest `scheduleId`, which silently halves the "half on the 1st, half on the 15th" split that is the stated reason `ObligationSchedule` is a separate entity at all |
| Event volume in the UI | `ProjectionTable` rolls `dailyExpense` events up per day behind a `<details>`; `WaterfallChart` merges same-day same-kind events into one bar. Five daily expenses over 12 months is ~1,825 events and ~9,000 at the five-year cap — the engine copes, a 1,825-row table does not |
| Metric divisor | `monthsInRange = rangeDays / 30.4375`, never zero because `rangeDays ≥ 1`. `annualEquivalentMinor` **excludes** `recurrence: 'oneOff'`, following `annualizedIncome(…, { includeOneOff = false })` |
| Algorithm | Generate an event list once per entity, sort once, sweep once. Not a per-day rescan, and emphatically not built from `monthlyObligationTotal` — a per-month total is the very "spread it across the month" error `§2-D1` forbids |
| Charts | Hand-rolled inline SVG. No charting dependency. Every chart is paired with a table view of the same data (§7), so the screen is complete and accessible even if the SVG is plain |

**Non-goals:** scenarios and live what-if recompute (Epic E), target-rate solving (Epic F), tax
modelling (`§2-D10`, also Epic F), export (G4), back-projection into the past, **proration of a
partial month** (the gate's model uses the existing whole-month working-day math), and reconciling
`/horizon/money-in` with the Timeline's disbursement view. Any of those appearing in this work is
scope creep.

**Open questions still on the table (full text in `02-spec.md` §8).** The hourly model itself is
settled; four of its *consequences* are not, and each needs a yes/no before slice 2 merges because
each is a number a user will read:

| # | Question | Specified behaviour |
|---|---|---|
| Q1b | A covered month with **no** occurrence is never disbursed (quarterly `everyNDays`) | Disburse only covered months. **The most consequential open item in the epic** |
| Q1c | Partial months are **not** prorated — a stream starting 20 Jan disburses a full January | Accept, per the instruction to use the existing math |
| Q1d | **Mixed `coversPeriod`** across one stream's schedules disburses ~two months per calendar month | Accept and do not special-case; it is configured, not inferred |
| Q1e | The `'next'`/`'previous'` **anchor mapping is not injective** — two occurrences can collapse onto one boundary | The later one gets an empty sub-range and emits nothing; money is conserved, one payday is not shown |

Revision 1's Q1 (which hourly model), Q2 (accept the divergence) and Q3 (in-arrears past `endDate`)
are **closed** by human-gate decisions 1, 4 and 2 respectively; the day-0 convention is closed by
decision 3 and the range defaults by decision 5.

---

## 2. Data model

The `Projection` type in `horizon-user-stories.md` §3 is marked "(computed, not stored)", and it
stays that way — the engine reads the existing tables and returns a value. Exactly two schema
changes are needed, both driven by durable *user* state rather than by the projection itself:
`§5-D3`'s dismissals and `§5-D4`'s configured order. Both land in one migration.

### 2a. `supabase/migrations/0022_horizon_projection.sql`

```sql
-- Horizon Epic D — durable projection state: negative-day dismissals (§5-D3)
-- and the configurable same-day event order (§5-D4). The projection itself is
-- computed, never stored. See docs/horizon-epic-d-plan.md §2. Additive and
-- backward compatible.

create table public.horizon_projection_dismissals (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id) on delete cascade,
  negative_date    date not null,
  -- The shortfall as a positive magnitude, in the reporting currency at the
  -- moment of dismissal. Stored so a WORSENING shortfall on an already
  -- dismissed date re-surfaces instead of staying hidden.
  shortfall_minor  bigint not null,
  currency         text not null,
  reason           text not null,
  created_at       timestamptz not null default now(),
  constraint horizon_projection_dismissals_currency_allowed
    check (currency in ('RSD','EUR','USD','RUB')),
  constraint horizon_projection_dismissals_shortfall_positive
    check (shortfall_minor > 0),
  constraint horizon_projection_dismissals_reason_len
    check (char_length(btrim(reason)) between 1 and 500),
  constraint horizon_projection_dismissals_unique_date
    unique (household_id, negative_date)
);
```

**No separate household index.** The unique constraint already builds exactly the
`(household_id, negative_date)` btree, and a duplicate index is dead weight on every write.

No `updated_at` and no touch trigger: a dismissal is written once and replaced wholesale by an
upsert on `(household_id, negative_date)` when the same date is dismissed again at a worse
shortfall. `horizon_one_off_events` is the precedent for a Horizon table with neither. The unique
constraint is what makes the upsert idempotent, and `fake-supabase.ts` already supports
`.upsert(payload, { onConflict: 'household_id,negative_date' })`.

`reason text not null` with a 1–500 check mirrors `reconcileAccountBalanceSchema`'s
`note: z.string().max(500)`. A dismissal without a reason is not a dismissal — `§5-D3` says so — so
unlike `note` it is `not null`.

RLS, four policies and grants exactly as every other Horizon table:

```sql
alter table public.horizon_projection_dismissals enable row level security;

create policy "horizon_projection_dismissals_select" on public.horizon_projection_dismissals for select using (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_insert" on public.horizon_projection_dismissals for insert with check (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_update" on public.horizon_projection_dismissals for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "horizon_projection_dismissals_delete" on public.horizon_projection_dismissals for delete using (public.is_household_member(household_id));

grant select, insert, update, delete on public.horizon_projection_dismissals to authenticated;
grant select, insert, update, delete on public.horizon_projection_dismissals to service_role;
```

### 2b. `households.horizon_event_order` (same migration)

```sql
alter table public.households add column horizon_event_order text;
update public.households
  set horizon_event_order = 'income,oneOffIn,obligation,dailyExpense,oneOffOut';
alter table public.households
  alter column horizon_event_order set not null,
  alter column horizon_event_order set default 'income,oneOffIn,obligation,dailyExpense,oneOffOut',
  -- Containment plus an exact length is a permutation check without a
  -- subquery (checks can't contain subqueries). string_to_array is immutable.
  add constraint households_horizon_event_order_valid
    check (
      string_to_array(horizon_event_order, ',')
        @> array['income','oneOffIn','obligation','dailyExpense','oneOffOut']
      and array_length(string_to_array(horizon_event_order, ','), 1) = 5
    );
```

Add-nullable → backfill → not-null + default + check is 0014's `ledger_reporting_currency`
pattern, and it is what keeps the migration safe against the previous release's code while
release-please runs `supabase db push` ahead of `vercel deploy --prod`.

`transfers` is absent by design (§1). Five slots, five kinds, and the check constraint makes an
invalid order unrepresentable rather than merely discouraged.

### 2c. Migration debt cleared first, in its own PR

The local database is migrated only through **0020**, and
`apps/web/src/lib/supabase/database.types.ts` was **hand-edited** for both 0020 and 0021 because
Docker was unavailable when Epic C shipped. Docker and local Supabase are up now.

That regeneration is **slice 0**, alone: `chore: regenerate database.types.ts from migrations`. It
is deliberately *not* bundled with slice 1's refactor, whose entire safety argument is "every
existing assertion passes unchanged" — an unknown-risk regeneration that may reveal the hand-edits
were wrong would destroy that signal. Because the regenerated file lives under
`apps/web/src/lib/supabase/`, CI's `dorny/paths-filter` fires the whole DB block including the
types-match gate with no migration needed, so slice 0 is a real gate rather than a formality.
Slice 4 regenerates again on top of 0022; there is no conflict.

---

## 3. Application layers

```
apps/web/src/lib/horizon/
  schedule.ts               MODIFIED. Slice 1: exports addDays and monthsBetween, and
                             ADDS daysBetween (moved from spending-math.ts:219 — it does
                             not exist here today). parseDate/formatDate stay
                             module-private: nothing outside consumes them, and an
                             unconsumed export is a knip failure.
                             Slice 2: + monthBounds(month).
  types.ts                  MODIFIED. HorizonSettings gains eventOrder.
  income/income-math.ts     MODIFIED. + workingDaysBetween (0 for an inverted window);
                             workingDaysInMonth becomes a one-line wrapper over it.
                             Consumed for real by hourly.ts's sub-range partition
                             in slice 2. NOT modified otherwise: hourlyIncomeForPeriod
                             and monthlyIncomeForStream are reused as they stand.
  spending/spending-math.ts MODIFIED. Deletes its verbatim copy of the date helpers
                             (lines 203-243) and imports them from schedule.ts.
  projection/
    types.ts                THE single home for every shared projection type, split
                             across two slices so no export lands before its consumer
                             (knip — round-2 critique M7):
                             SLICE 2: SLIPPAGE_PAD_DAYS, HOURLY_GROUP_PAD_DAYS,
                               EVENT_KINDS, ProjectionEventKind, DEFAULT_EVENT_ORDER,
                               ProjectionEvent, DailyBalance, AccountDayBalance,
                               MonthPair, Projection, ProjectionInputs, ProjectionOptions
                             SLICE 3: AVERAGE_DAYS_PER_MONTH, NegativeDay, Suggestion,
                               SuggestionOptions, ProjectionDismissal, MetricWithInputs,
                               ProjectionMetrics
    events.ts               PURE. buildProjectionEvents + per-source builders
    hourly.ts               PURE. hourlyPaymentsForStream — §3d's covered-month
                             partition. Its parameter is typed
                             Extract<IncomeStream, { kind: 'hourly' }>: HourlyIncomeStream
                             is NOT exported (verified, income/types.ts:33) and this
                             plan adds no export for it (critique M5).
    projection.ts           PURE. projectCashflow — filter, build, sort, sweep
    metrics.ts              PURE. projectionMetrics (§5-D5)
    warnings.ts             PURE. negativeDays, suggestFixes, applyDismissals (§5-D3)
    mappers.ts              toProjectionDismissal
    validation.ts           dismissNegativeDaySchema, eventOrderUpdateSchema
    {events,hourly,projection,metrics,warnings}.test.ts
  queries/projection.ts     getProjectionDismissals
  mutations/projection.ts   dismissNegativeDay, undismissNegativeDay
  queries/settings.ts       MODIFIED. reads horizon_event_order
  mutations/settings.ts     MODIFIED. + setHorizonEventOrder
apps/web/src/app/actions/
  horizon-projection.ts     dismiss / undismiss
  horizon-settings.ts       MODIFIED. + setEventOrder action
```

`ProjectionDismissal` lands in `projection/types.ts` in **slice 3**, alongside `applyDismissals`,
which takes it — not in slice 4's `mappers.ts`, which would leave slice 3 unable to typecheck.

**Per-helper consumer table for slice 1 (knip).** No export lands before the slice that consumes it:

| Helper | Consumed in slice 1 by |
|---|---|
| `addDays` | `spending-math.ts` (`chargeDates`), `schedule.ts` itself |
| `daysBetween` | `spending-math.ts` (`chargeDates`, weekly branch) |
| `monthsBetween` | `spending-math.ts` (`monthlyDailyExpenseTotal`), `schedule.ts` itself |
| `workingDaysBetween` | `income-math.ts` (`workingDaysInMonth`) + `income-math.test.ts` |
| `parseDate`, `formatDate` | **not exported** — nothing outside `schedule.ts` consumes them |

Reuse, unchanged, exactly as Epics B and C list it: `Currency`/`Money`/`CURRENCIES`/
`CURRENCY_EXPONENT` from `lib/types.ts`, `formatMoney` from `lib/format.ts`,
`verifySession`/`getHouseholdId` from `lib/auth/dal.ts`, `createClient`, `reportError`,
`ActionResult` from `app/actions/expenses.ts`, and the query/mutation/action shapes from
`spending.ts`/`horizon-spending.ts`. Plus, specifically for the engine:
`generateDates`/`applySlippage`/`coveredPeriod`/`daysInMonth` from `lib/horizon/schedule.ts`,
`convert`/`pickRate`/`rateAgeDays`/`isStale` from `lib/horizon/fx.ts`,
`hourlyIncomeForPeriod` from `lib/horizon/income/income-math.ts`, and
`chargeDates`/`chargeAmount` from `lib/horizon/spending/spending-math.ts`.

`nextDatesForSchedules` is deliberately *not* used: it answers "the next N occurrences" for list
screens (`schedule.ts:243`), while the projection needs "every occurrence in a range", which is
`generateDates`. **Hourly streams are generated exactly once**: `hourlyPaymentsForStream` is the
sole date generator for hourly income, and `events.ts` maps its output rather than calling
`generateDates` for an hourly stream itself.

### `lib/horizon/projection/types.ts`

```ts
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

/** Slice 3, with metrics.ts as its consumer (knip — critique M7). */
export const AVERAGE_DAYS_PER_MONTH = 30.4375;

export const EVENT_KINDS = [
  'income', 'oneOffIn', 'obligation', 'dailyExpense', 'oneOffOut',
] as const;
export type ProjectionEventKind = (typeof EVENT_KINDS)[number];

/** §5-D4's default: income -> one-off inflows -> obligations -> daily expenses
 *  -> one-off outflows. "Transfers" is absent because no transfer entity exists
 *  in this codebase (see §1). */
export const DEFAULT_EVENT_ORDER: readonly ProjectionEventKind[] = EVENT_KINDS;

export interface ProjectionEvent {
  /** The date cash actually moves — post-slippage, and the date this event was
   *  filtered into [from, to] on. Never the covered period. */
  date: string;
  /** The unslipped generated date; equals `date` when nothing shifted. This is
   *  the date startDate/endDate were evaluated against. */
  originalDate: string;
  shifted: boolean;
  kind: ProjectionEventKind;
  label: string;              // the entity name; the UI adds i18n framing
  sourceId: string;           // stream / obligation / expense / one-off id
  scheduleId: string | null;  // null for daily expenses and one-offs
  occurrenceIndex: number;    // nth occurrence of this source in the range
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
  recurrence: Recurrence;     // §2-D7 — never inferred, always carried
  confidence: Confidence;     // §2-D8/G1
  /** §2-D14: distinguishes an amount the engine DERIVED from one the user
   *  ENTERED. Rendered as a text badge beside the confidence badge. */
  derivation: 'entered' | 'hourlyDerived' | 'accrualCharge';
  coveredPeriod: string | null;  // 'YYYY-MM' — a LABEL, never a cash date
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
  month: string;                                  // 'YYYY-MM'
  end: { date: string; balanceMinor: number };
  /** The earliest day in the month attaining the minimum, and its balance. */
  minimum: { date: string; balanceMinor: number };
  /** True for a first/last month truncated by the range. Kept, never dropped —
   *  excluding it would hide a month — and `end.date` is the last IN-RANGE day,
   *  which the UI labels so a 12-day stub isn't read as a month end. */
  partial: boolean;
}

/** Every variant carries a deterministic `id`, used both as the final ranking
 *  tie-break and as the React key:
 *  `${kind}:${negDate}:${sourceId ?? 'none'}:${refDate ?? 'none'}`. */
/** Which pot the advice is about (critique M2). For 'account' the minima are
 *  computed over that account's own daily series, in its own currency, and only
 *  that account's events are candidates. */
export type SuggestionScope =
  | { kind: 'total' }
  | { kind: 'account'; accountId: string; currency: Currency };

export type Suggestion =
  | { kind: 'shiftPayment'; id: string; scope: SuggestionScope; sourceId: string;
      eventLabel: string; eventDate: string; amountMinor: number;
      /** null = no landing date inside this horizon clears the run. */
      suggestedDate: string | null }
  | { kind: 'bringForward'; id: string; scope: SuggestionScope; sourceId: string;
      eventLabel: string; eventDate: string; amountMinor: number;
      /** The FIRST day of the negative run — which is what the emission
       *  condition already assumed (critique N-h). */
      toDate: string }
  | { kind: 'holdBack'; id: string; scope: SuggestionScope; amountMinor: number;
      /** null when no inflow precedes the negative date inside the horizon —
       *  "hold this back out of whatever arrives". Still actionable, and it is
       *  what makes suggestFixes a total function. */
      from: { label: string; date: string; sourceId: string } | null };

export interface SuggestionOptions {
  /** How far back shiftPayment looks for a movable outflow. Default 3: a
   *  payment can usually be nudged a few days without renegotiating anything,
   *  and §5-D3 asks for the NEAREST fix. Beyond ~3 days it stops being a nudge.
   *  A field, not a literal buried in the function, so it tunes in one place. */
  shiftWindowDays: number;
}

export interface NegativeDay {
  date: string;
  /** Positive magnitude of the worse of the two triggers. */
  shortfallMinor: number;
  /** Normally the reporting currency. When ONLY the account trigger fired and
   *  that account's convertedMinor is null (no rate), "the worse of the two in
   *  the reporting currency" is undefined, so this is the offending account's
   *  own currency and shortfallMinor its native shortfall (critique N-h). */
  shortfallCurrency: Currency;
  /** Which condition fired (N1). */
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

/** Added HERE, in slice 3, alongside applyDismissals which consumes it. */
export interface ProjectionDismissal {
  id: string;
  negativeDate: string;
  shortfallMinor: Money;
  currency: Currency;
  reason: string;
  createdAt: string;
}

export interface MetricWithInputs<T> {
  value: T;
  inputs: Record<string, number | string | null>;
  /** An i18n key naming the formula, so the component renders §5-D5/G2's
   *  "inputs, FORMULA and the assumptions used" as data, not hardcoded prose. */
  formulaKey: string;
  /** 'shortRange' when rangeDays < 28, else null — a 10-day extrapolation is
   *  labelled rather than presented as fact. */
  caveatKey: string | null;
}

export interface ProjectionMetrics {
  monthlySurplusMinor: MetricWithInputs<number>;
  annualEquivalentMinor: MetricWithInputs<number>;
  runwayMonths: MetricWithInputs<number | null>;
  firstNegativeDate: MetricWithInputs<string | null>;
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
  to: string;                   // inclusive
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
  // `suggestions` DROPPED (critique M7): projectCashflow produces no warnings
  // and suggestFixes takes its own SuggestionOptions argument, so it was never
  // read.
}

export interface Projection {
  dailyBalances: DailyBalance[];   // one per calendar day in [from, to], no gaps
  events: ProjectionEvent[];       // sorted; see projection.ts's comparator
  monthPoints: MonthPair[];
  openingTotalMinor: number;
  hasMissingRate: boolean;
  missingRates: { from: Currency; to: Currency }[];
  oldestRateAsOfDate: string | null;
}
```

### `lib/horizon/projection/hourly.ts`

`monthlyIncomeForStream` gives a month **total**; a day-by-day projection needs the amount landing
on a **specific pay date**. The human gate settled how to get from one to the other, and the answer
reuses Epic B rather than inventing anything: the covered month determines the money, the payment
date only determines when it lands.

```ts
export interface HourlyPayment {
  date: string;          // post-slippage — the date cash lands
  originalDate: string;  // unslipped; everything below is derived from THIS
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
  amountMinor: Money;    // never negative, never zero (zero -> no event)
}

/**
 * A COVERED MONTH'S TOTAL, DISBURSED (human-gate decision 1 + its refinement).
 * An hourly stream's amount depends ONLY on the working days in a calendar
 * month. A payment date is merely WHEN that already-determined total gets
 * disbursed, and may lag well behind the month it covers. There is no accrual,
 * no running total and no difference math anywhere in this file.
 *
 *  1. Occurrences  every occurrence of every schedule of the stream over
 *                  [range.from − HOURLY_GROUP_PAD_DAYS,
 *                   range.to   + HOURLY_GROUP_PAD_DAYS], UNSLIPPED.
 *  2. Covered month  period_i = coveredPeriod(u_i, r_i) on the UNSLIPPED date
 *                  u_i — schedule.ts:274-293 unchanged. coveredPeriod's own doc
 *                  comment already insists on the unslipped date.
 *  3. Active window  keep the occurrence iff its COVERED MONTH overlaps
 *                  [startDate, endDate]:
 *                    monthBounds(period_i).last  >= stream.startDate  AND
 *                    monthBounds(period_i).first <= (stream.endDate ?? '9999-12-31')
 *                  Note this tests the covered month, NOT the payment date —
 *                  that is what implements in-arrears settlement (below).
 *  4. Group        partition survivors by (stream.id, period_i). Occurrences
 *                  from DIFFERENT covered months are never partitioned against
 *                  each other.
 *  5. Anchor       a day inside the covered month to partition on. For
 *                  coversPeriod 'same', anchor_i = u_i. For 'next'/'previous'
 *                  the payment date is not in the covered month, so map the
 *                  day-of-month across, clamped:
 *                    anchor_i = period_i + '-' +
 *                      min(dayOfMonth(u_i), daysInMonth(period_i))
 *                  NOT INJECTIVE — see "collapsed anchors" below and §8 Q1e.
 *                  Order the group by anchor, then u_i, then scheduleId.
 *  6. Sub-period   with first/last from monthBounds(period_i) and anchors
 *                  a_1 <= ... <= a_k:
 *                    subFrom_i = (i === 1 ? first : addDays(a_{i−1}, 1))
 *                    subTo_i   = (i === k ? last  : a_i)
 *                  i.e. (a_{i−1}, a_i], opened back to the month's first day and
 *                  extended to its last. The sub-ranges PARTITION the covered
 *                  month exactly. A single-schedule stream is k = 1 spanning the
 *                  whole month; a 15th + month-end stream spans 1–15 and 16–end.
 *  7. Amount       w_i   = workingDaysBetween(subFrom_i, subTo_i, calendar)
 *                  raw_i = hourlyIncomeForPeriod(stream.hourlyRateMinor,
 *                                                stream.hoursPerDay, w_i)
 *                  — §2-D9 verbatim: rate × hours/day × working days IN THE
 *                  PERIOD, where the period is the span this occurrence covers.
 *  8. Date         applySlippage(u_i, calendar, r_i.slippagePolicy). Range
 *                  filtering happens on that landed date, in events.ts, AFTER
 *                  everything above.
 *
 * THE MONTH-TOTAL REMAINDER RULE (named; its own test). Each raw_i is rounded
 * independently, so Σ raw_i can differ from the month's own figure by a minor
 * unit or two. T = monthlyIncomeForStream(stream, schedules, period, calendar)
 * — memoised per (streamId, period) — is the CONSERVATION ANCHOR: let j be the
 * LAST occurrence in the group whose sub-range holds at least one working day,
 * and set
 *     amount_j = T − Σ_{i ≠ j} raw_i,   amount_i = raw_i otherwise.
 * The group therefore sums to EXACTLY T for every stream and every month. If no
 * sub-range holds a working day then T = 0 and every amount is 0.
 *
 * THIS IS NOT A RETURN TO THE ACCRUAL MODEL. It carries no state across months,
 * no running total and no reference to any previous payment: T is a pure
 * function of (stream, month, calendar) and the correction is applied entirely
 * inside ONE covered month. A reader who sees "remainder" must not read
 * "cumulative". amount_j is non-negative whenever
 * hourlyRateMinor × hoursPerDay >= k / 2 — true of any real stream; the worst
 * case is k half-unit roundings against a single working day — and §5 pins the
 * corner as a test rather than leaving it to assumption.
 *
 * SLIPPAGE INDEPENDENCE — round 2's M1 bug cannot reappear. M1 found that the
 * accrual model re-created B3: cum_0 was "the last occurrence strictly before
 * `from`" on the UNSLIPPED date while events were filtered on the LANDED date,
 * so a month-end payment slipping into range had its money treated as already
 * banked. That bug required a BASELINE — state carried from one payment to the
 * next. THIS MODEL HAS NO BASELINE. amountMinor_i is a function of exactly
 * (hourlyRateMinor, hoursPerDay, period_i, calendar, the group's anchor days),
 * and every one of those derives from the UNSLIPPED date. Slippage decides only
 * the event's `date`, and hence only whether it survives the (today, to] filter.
 * A payment slipping from 31 Jan to 2 Feb carries its January sub-range's amount
 * onto 2 Feb — exactly the behaviour the gate described. §5 asserts it twice:
 * once for presence and amount, once as an invariant against the same fixture
 * with slippagePolicy 'none'.
 *
 * LOAD-BEARING: PARTITION BEFORE FILTER. The group — and every sub-range
 * boundary — MUST be computed over the padded window, never over the
 * range-filtered set. Otherwise a 15th-and-month-end stream whose 15th falls
 * before range.from leaves the month-end payment alone in its group, spanning
 * 1–31 instead of 16–31, overstating it ~2×. This is the one ordering
 * constraint here an implementer could plausibly get wrong; §5 tests it.
 *
 * COLLAPSED ANCHORS (§8 Q1e). Because step 5's mapping is not injective, two
 * occurrences can share an anchor. Then subFrom_i > subTo_i for the later one,
 * workingDaysBetween returns 0 by its stated inverted-window convention, and the
 * zero-amount rule drops the event. NO MONEY IS LOST — the sub-ranges still
 * partition the month and the remainder rule still anchors the group to T — but
 * the user sees one payday fewer than they configured, which is why it is
 * flagged rather than merely handled.
 *
 * IN-ARREARS SETTLEMENT PAST endDate (human-gate decision 2, re-expressed). Its
 * old justification was about cut dates, which no longer exist; the mechanism is
 * now step 3's covered-month overlap. A stream ending 10 Jan and paid month-end
 * still emits its 31 Jan payment for covered month 2026-01; its 28 Feb payment
 * covers 2026-02, does not overlap the active window, and is dropped. Earned
 * income cannot disappear at endDate. CONSEQUENCE, STATED: because
 * monthlyIncomeForStream ignores endDate, that 31 Jan payment is January's FULL
 * total, not 1–10 January's. Revision 1's accrual model prorated it. §8 Q1c.
 *
 * DIVERGENCE FROM /horizon/money-in, re-derived (human-gate decision 4). This
 * file calls monthlyIncomeForStream — the IDENTICAL function Money-in calls — so
 * for any covered month with at least one occurrence the Timeline's
 * disbursements sum to Money-in's figure EXACTLY, to the minor unit. Round 2's
 * ±1-minor-unit finding (N-a) is precisely what the remainder rule absorbs, and
 * §5 asserts exact equality on a NON-INTEGRAL rate × hours fixture. What remains
 * is timing and coverage, not computation:
 *  (i)   a covered month with NO occurrence is never disbursed — a quarterly
 *        everyNDays: 90 stream shows one month per quarter on the Timeline and
 *        three on Money-in. The largest remaining gap, and a direct consequence
 *        of the settled model: §8 Q1b;
 *  (ii)  'next'/'previous' shifts income by one month relative to Money-in,
 *        which attributes it to the payment month;
 *  (iii) horizon edges — a month covered by an occurrence outside [from, to]
 *        contributes nothing. Structural, not a disagreement;
 *  (iv)  PARTIAL MONTHS NOW AGREE. Both screens use the full-month figure. §8
 *        Q1c is about whether a full January is RIGHT, not about consistency.
 *
 * WHAT THIS REPLACES. Revision 1's cumulative accrual — H(cum_i) − H(cum_{i−1}),
 * the monotone max() clamp, cum_0, HOURLY_LOOKBACK_DAYS = 400,
 * shiftMonthKeepingDay, cut dates, the telescoping-conservation argument — is
 * REJECTED and deleted. Round 1's even MONEY split (Math.floor(T / n) per
 * occurrence) is also not what this is: the objection to it was mid-month
 * overstatement, and here the 15th's payment is the working days ACTUALLY
 * WORKED by the 15th (8 of 22, not 11 of 22), so the intra-month trough §2-D2
 * exists to catch is preserved. No money is divided anywhere; only working days
 * are partitioned.
 */
export function hourlyPaymentsForStream(
  stream: Extract<IncomeStream, { kind: 'hourly' }>,
  schedules: IncomeSchedule[],
  calendar: ScheduleCalendar,
  range: { from: string; to: string }
): HourlyPayment[];
```

`HourlyIncomeStream` is **not exported** — verified, `income/types.ts:33` declares it without
`export`; only the `IncomeStream` union is exported at line 45. Revision 1's signature would not
have compiled (round-2 critique M5). `Extract<IncomeStream, { kind: 'hourly' }>` is the cheaper of
the two fixes and adds no export, so slice 1's per-helper consumer table stays true as written.

Flat (`fixed`/`variable`) streams need none of this — `fixedAmountMinor` is already
per-occurrence, which is why `monthlyIncomeForStream` multiplies it by an occurrence count.
`variable` is a `FlatIncomeStream` in the union (`income/types.ts:47`) and is projected as flat; its
uncertainty is carried by `confidence`, not by a different amount.

### `lib/horizon/income/income-math.ts` (modified)

```ts
/** Working days in an arbitrary INCLUSIVE window, from the calendar.
 *  Returns 0 when from > to — the same convention generateDates uses
 *  (`if (from > to) return []`, schedule.ts:136). Specified, and tested. */
export function workingDaysBetween(
  from: string, to: string, calendar: ScheduleCalendar
): number;

/** Unchanged behaviour, now a wrapper: the month's first day to its last.
 *  One implementation of "count working days", not two that can drift. */
export function workingDaysInMonth(month: string, calendar: ScheduleCalendar): number;
```

### `lib/horizon/projection/events.ts`

```ts
/**
 * Every dated money movement in the range, unsorted. One pass per entity —
 * never a per-day rescan and never built from monthlyObligationTotal, which is
 * a per-MONTH figure and would reintroduce exactly the "spread it evenly across
 * the month" error §2-D1 forbids.
 *
 * GENERATE ON A PADDED WINDOW, THEN FILTER ON THE LANDED DATE. Per entity the
 * generation range is
 *   { from: max(range.from − SLIPPAGE_PAD_DAYS, entity.startDate),
 *     to:   min(range.to   + SLIPPAGE_PAD_DAYS, entity.endDate ?? +∞) }
 * because neither generateDates nor chargeDates honours startDate/endDate — the
 * range is their only bound. startDate/endDate are evaluated against the
 * UNSLIPPED generated date: the due date is what the entity's active window
 * governs; slippage is a banking artefact applied afterwards. Each date is then
 * slipped via applySlippage and filtered ON THE LANDED DATE against
 * (options.today, range.to] — RIGHT-INCLUSIVE, LEFT-EXCLUSIVE OF TODAY, per the
 * day-0 convention (human-gate decision 3): an event dated today is already
 * reflected in the opening balance the user typed in, so projecting it again
 * subtracts it twice on the most-scrutinised day of the chart. Since `from` is
 * clamped to `today`, this is [from + 1d, to]. dailyBalances is UNAFFECTED: it
 * still covers [from, to] inclusive with no gaps, and its first row closes at
 * exactly openingTotalMinor.
 *
 * That order is the only one correct at BOTH edges: a dayOfMonth: 31 rent whose
 * 31 Jan due date is a Saturday and slips to Mon 2 Feb is KEPT when the range
 * starts 1 Feb; an occurrence generated on the last in-range day that slips
 * past `to` is DROPPED, so every event is guaranteed a DailyBalance row to
 * attach to — §5-D1's "no gaps" and "every event is in range" stop
 * contradicting each other.
 *
 * WHY 31 DAYS IS ENOUGH, per schedule kind. applySlippage (schedule.ts:75-88)
 * walks one day at a time across a contiguous run of non-working days, giving
 * up after 366 iterations; the worst realistic run is a New-Year holiday block
 * (~10 days) beside two weekends, well under 31. The cost is bounded for every
 * kind: dayOfMonth / monthEnd / nthWeekday generate ≤ 2 extra occurrences (one
 * per edge); oneOff ≤ 1; everyNDays generates ⌈31 / intervalDays⌉ extra per
 * edge — ≤ 31 in the pathological intervalDays: 1 case, 1 for anything monthly
 * or coarser. Daily expenses carry NO slippage policy (chargeDates has no
 * calendar argument), so they are generated on the unpadded clamped range.
 * EXCEPTION: hourly streams use the wider HOURLY_GROUP_PAD_DAYS = 92 window
 * (group completeness, proved in hourly.ts) and are clamped by COVERED-MONTH
 * OVERLAP rather than by startDate/endDate on the payment date, which is what
 * implements in-arrears settlement.
 *
 * DUPLICATE SUPPRESSION. De-duplicate on (sourceId, scheduleId, originalDate) —
 * a key that can only collide if ONE schedule produced the same date twice,
 * which it never does, so in practice this is a defensive no-op. Revision 1
 * keyed on (sourceId, originalDate) and kept the lowest scheduleId, calling a
 * cross-schedule collision a data-entry duplicate. Round-2 critique N-g is
 * right that this silently HALVES a deliberately split payment, and "half on
 * the 1st, half on the 15th" is the stated reason ObligationSchedule is a
 * separate entity at all. Two schedules resolving to one date now produce TWO
 * events, ordered by projection.ts's comparator. Two DISTINCT unslipped dates
 * that slip onto the same landing date are likewise not merged.
 *
 * ZERO-AMOUNT EVENTS ARE NOT EMITTED, of any kind. They carry no information,
 * clutter the table and the waterfall, and are the natural output of
 * hoursPerDay: 0, a zero-working-day window and a fully-settled hourly stream.
 *
 *   income    -> hourly amounts via hourlyPaymentsForStream (the SOLE date
 *                generator for hourly income — events.ts never calls
 *                generateDates for an hourly stream), derivation
 *                'hourlyDerived'; flat amounts = fixedAmountMinor via
 *                generateDates + applySlippage, derivation 'entered'
 *   obligation-> generateDates + applySlippage; amountMinor per occurrence,
 *                derivation 'entered'
 *   dailyExpense -> chargeDates, then chargeAmount(daily, cadence,
 *                daysInMonth(charge month)) for the monthly cadence;
 *                derivation 'accrualCharge' for the weekly and monthly
 *                cadences and 'entered' for 'daily', whose "lump" is
 *                chargeAmount(daily, 'daily', ...) = daily × 1, i.e. exactly the
 *                number the user typed (critique N-i). No slippage policy: they
 *                post on the generated date.
 *   oneOff    -> its own `date`; sign from `direction` (amount_minor is always
 *                positive in the DB), kind oneOffIn / oneOffOut, derivation
 *                'entered'. OneOffEvent has no `archived` column
 *                (spending/types.ts:100-112) — there is nothing to filter.
 */
export function buildProjectionEvents(
  inputs: ProjectionInputs,
  options: ProjectionOptions
): ProjectionEvent[];
```

### `lib/horizon/projection/projection.ts`

```ts
/**
 * The engine. Pure and deterministic: no Date.now(), no live FX, no I/O —
 * `today`, the range, the rate snapshots, the calendar and the same-day order
 * are all arguments (§7, and the same discipline as fx.ts / schedule.ts /
 * today.ts / income-math.ts / spending-math.ts).
 *
 * Filter -> build -> convert -> sort -> sweep -> derive, once each:
 *
 *  1. FILTER ARCHIVED, before anything else, at this ONE choke point — not in
 *     the query layer, because the list screens legitimately show archived
 *     rows. HorizonAccount.archived, IncomeStream.archived,
 *     Obligation.archived, DailyExpense.archived. OneOffEvent has no such
 *     column. Archived ACCOUNTS are excluded outright: no opening balance
 *     contribution and no AccountDayBalance row, regardless of includeInTotal —
 *     exactly summarizeToday's .filter((a) => !a.archived) at today.ts:43. An
 *     event whose accountId names an archived or unknown account is dropped.
 *     Also clamp defensively: from = max(from, today), to = max(to, from).
 *  2. buildProjectionEvents over the padded window.              O(E)
 *  3. Convert each event TWICE, both pinned to options.today:
 *       event currency -> the owning account's currency (moves that account's
 *         native running balance), and
 *       account currency -> reportingCurrency (feeds the headline series).
 *     Identity short-circuits before pickRate is touched. A null rate at either
 *     hop sets hasMissingRate, records the pair in missingRates, marks the
 *     event unconvertible and excludes it from balances — it NEVER throws and
 *     the event is still returned, exactly as summarizeToday does it. On an
 *     unconvertible event balanceBefore === balanceAfter: the balance genuinely
 *     did not move. convert() itself throws on a null rate by design, so every
 *     call site is guarded by a pickRate null check first.
 *  4. Sort once with an explicit comparator:
 *       date asc, then order.indexOf(kind), then sourceId, then
 *       scheduleId ?? '', then occurrenceIndex.
 *     The last three exist so ties never depend on V8's stable sort or on input
 *     order — A3/§7 require two runs of identical inputs to produce
 *     byte-identical output.                                     O(E log E)
 *  5. Sweep the day cursor and the sorted array together in one pass, opening
 *     from each LIVE account's currentBalanceMinor as of `today` (which equals
 *     `from`, since from is clamped to today). Stamp balanceBefore/After per
 *     event (§5-D1) — which is also, for free, §5-D4's running balance between
 *     same-day events. Emit one DailyBalance per calendar day, no gaps.
 *                                                                O(E + D*A)
 *  6. Derive monthPoints: month-end AND the month's minimum with its exact
 *     date, always as a pair (§2-D2). A truncated first/last month is KEPT with
 *     partial: true and end.date = the last in-range day.
 *
 * For §7's target of 365 days x ~80 events x <=6 accounts that is ~80
 * comparisons and ~2,200 emitted numbers. The per-day-per-account conversion is
 * a constant scale factor that could be hoisted (each account converts at one
 * pinned rate) — noted, done if the benchmark asks for it, not designed around.
 * Only accounts with includeInTotal contribute to totalMinor, matching
 * summarizeToday.
 */
export function projectCashflow(
  inputs: ProjectionInputs,
  options: ProjectionOptions
): Projection;
```

### `lib/horizon/projection/warnings.ts`

`Suggestion`, `SuggestionOptions`, `NegativeDay` and `ProjectionDismissal` are declared in
`projection/types.ts`, not here — one home for every shared projection type.

```ts
/**
 * §5-D3. A date raises a warning when EITHER the reporting-currency total
 * closes below zero OR any live includeInTotal account closes below zero in its
 * own currency. Accounts are not fungible — you cannot pay rent out of a
 * business account by fiat — and §2-D2's motivating scenario is precisely a
 * household total of +200,000 hiding a personal account at −124,600.
 * shortfallMinor is the worse of the two in the reporting currency,
 * negativeAccountIds lists the offenders, trigger says which fired. There is
 * still exactly ONE warning stream, keyed on the date, so the dismissal key and
 * the banner do not multiply.
 *
 * THE SIGNATURE WORKS BECAUSE AccountDayBalance CARRIES includeInTotal AND
 * currency (critique M3). Without them this function could not implement its own
 * trigger: non-includeInTotal accounts ARE present in DailyBalance.accounts —
 * they are merely excluded from totalMinor — so it would warn on accounts it
 * shouldn't, or not compile as specified.
 *
 * OVERDRAFT SUPPRESSION (critique N-h). HorizonAccount.currentBalanceMinor is
 * documented as possibly negative, so an account deliberately run in overdraft
 * would fire the account trigger on EVERY day of the horizon, dismissible one
 * date at a time. An account whose OPENING balance is already negative therefore
 * does not fire the account trigger at all — it is already negative today and
 * the projection is telling the user nothing new. The total trigger still
 * catches it.
 *
 * UNCONVERTIBLE OFFENDER (critique N-h). When only the account trigger fired and
 * that account's convertedMinor is null, "the worse of the two in the reporting
 * currency" is undefined. shortfallMinor is then the account's NATIVE shortfall
 * and shortfallCurrency its own currency. Nothing is NaN; nothing throws.
 */
export function negativeDays(
  projection: Projection
): Omit<NegativeDay, 'dismissed' | 'dismissedReason'>[];

/**
 * "The nearest fix" — three EXACT functions over the swept series. No re-sweep,
 * no approximation, no heuristics.
 *
 * WHICH SERIES (critique M2). Every Suggestion carries a `scope`. Revision 1
 * defined all three algorithms over the reporting-currency total only, which
 * meant that for a trigger: 'account' day — the +200,000-total / −124,600-account
 * scenario the account trigger was ADOPTED to catch — every condition was
 * satisfied trivially and the engine emitted confident, precise, WRONG advice
 * ("hold back 124,600 out of the household total" does not fix the personal
 * account). So: for a total-triggered day the machinery runs over
 * DailyBalance.totalMinor with every convertible event as a candidate; for an
 * account-triggered day it runs over that account's own
 * AccountDayBalance.balanceMinor series, IN THAT ACCOUNT'S OWN CURRENCY, with
 * candidates restricted to events whose accountId matches. A 'both' day emits
 * for the total and for each offending account, ranked into one list.
 *
 * PER RUN, NOT PER DAY (critique N-h). Suggestions are computed once per maximal
 * negative run and the same array is attached to every NegativeDay in it.
 * Computing per day meant day 3 of a 5-day run got a bringForward that left days
 * 1–2 negative.
 *
 * ENABLING IDENTITY: moving a single convertible event of signed amount A from
 * day d0 to day d1 > d0 adds −A to series[t] for every t ∈ [d0, d1 − 1] and
 * changes nothing else. So every "would this fix it" question is answerable from
 * PREFIX/SUFFIX MINIMA of the daily series, computed once in O(D).
 *
 * Let run(negDate) be the maximal contiguous run of warning days containing
 * negDate, and worst(run) its largest shortfall.
 *
 *  shiftPayment  push an outflow later. Candidates: convertible outflow events
 *                landing in [negDate − shiftWindowDays, negDate]. Pick the
 *                smallest-magnitude candidate whose magnitude ≥ worst(run) —
 *                the least disruptive fix that actually works; if none
 *                qualifies, the largest candidate. Ties: later date first, then
 *                sourceId asc. suggestedDate = the earliest d > d0 with
 *                  min(series[t] + |A| for t ∈ [d0, d − 1]) ≥ 0
 *                and THAT IS THE ONLY CONDITION (critique M4). Revision 1 also
 *                demanded min(series[t] for t ∈ [d, to]) ≥ 0, which by the
 *                enabling identity above tests the UNTOUCHED BASELINE: days at
 *                or after d are byte-identical before and after the shift. Its
 *                real effect was to return null whenever ANY later day in the
 *                horizon was negative, telling a user with a fixable dip in
 *                March and an unrelated dip in November that neither was
 *                resolvable — revision 1 saw the symptom and mistook it for a
 *                feature. No "don't make it worse" guard replaces it: the only
 *                days that change move UP by |A|, so a shift cannot create a new
 *                negative day. A prefix minimum, so O(D) and exact.
 *                If no such d exists in [negDate, to], suggestedDate is NULL and
 *                now genuinely means "no landing date inside this horizon clears
 *                the run", which the UI says in words. With no candidates at all
 *                the suggestion is omitted.
 *  bringForward  pull an inflow earlier. The earliest convertible inflow after
 *                negDate, at date d1 with amount A. Emitted ONLY IF
 *                  min(series[t] for t ∈ [negDate, d1 − 1]) + A ≥ 0
 *                — it must clear the ENTIRE negative run it lands in, not
 *                merely negDate's own shortfall. toDate is the run's FIRST day
 *                (critique N-h: the type had no rule for it). Otherwise
 *                omitted; omitted too when there is no inflow after negDate in
 *                the horizon.
 *  holdBack      ALWAYS emitted, so the list is never empty. amountMinor =
 *                worst(run) — enough to clear the whole run, not just day one.
 *                `from` is the nearest convertible inflow at or before negDate
 *                within the horizon, or NULL when there is none: a projection
 *                whose very first day is negative from a negative opening
 *                balance has no preceding inflow, and "hold this back out of
 *                whatever arrives" is still actionable advice. That nullability
 *                is what makes suggestFixes a total function.
 *
 * DETERMINISM. Every Suggestion carries a deterministic composed id,
 * `${kind}:${negDate}:${sourceId ?? 'none'}:${refDate ?? 'none'}`, used as the
 * final ranking tie-break and as the React key. Ranking: reference-date
 * distance from negDate asc (a null reference sorts last), then amountMinor
 * desc, then id asc. The cap of three is STRUCTURAL — there are at most three
 * variants, one each — so "1–3 suggestions" is a property of the type, not a
 * runtime slice.
 */
export function suggestFixes(
  projection: Projection,
  date: string,
  options: SuggestionOptions
): Suggestion[];

/**
 * FLAGS RATHER THAN FILTERS: returns every negative day with dismissed set.
 * The banner filters; the data doesn't. That is what keeps firstNegativeDate (a
 * metric) from ever naming a date the array has hidden.
 *
 * A dismissal suppresses a warning ONLY while the current shortfall is no worse
 * than the dismissed one AND the reporting currency still matches. A worsening
 * shortfall or a currency change re-surfaces it — otherwise dismissing a −100
 * warning silently hides a −100,000 one on the same date.
 *
 * LIFECYCLE, accepted rather than engineered around: (i) a date that stops
 * being negative leaves its row in place, ignored, so an oscillating projection
 * can't quietly re-hide itself — deliberate; (ii) a date can become negative
 * again for entirely different reasons at an equal-or-smaller shortfall and be
 * suppressed — accepted, because the alternative is fingerprinting the CAUSE of
 * a shortfall. The one cheap mitigation is taken in the mutation:
 * dismissNegativeDay also deletes rows whose negative_date < today, so passed
 * dates cannot accumulate forever.
 */
export function applyDismissals(
  days: Omit<NegativeDay, 'dismissed' | 'dismissedReason'>[],
  dismissals: ProjectionDismissal[],
  reportingCurrency: Currency
): NegativeDay[];
```

### `lib/horizon/projection/metrics.ts`

```ts
/**
 * §5-D5. Each metric ships its own `inputs` AND a `formulaKey`, so "expand to
 * show its inputs" (§5-D5, and G2's "inputs, formula and the assumptions used")
 * is DATA the UI renders, not prose a component hardcodes.
 *
 * DIVISOR, GUARDED BY CONSTRUCTION.
 *   rangeDays     = daysBetween(from, to) + 1, which is >= 1 because §3k clamps
 *                   to >= from.
 *   monthsInRange = rangeDays / AVERAGE_DAYS_PER_MONTH (30.4375).
 * "Whole months in range" would be 0 for a sub-month range and would produce
 * Infinity/NaN across three metrics; average days removes the zero divisor
 * structurally instead of guarding it after the fact. Both are in `inputs`, and
 * every metric carries caveatKey 'shortRange' when rangeDays < 28.
 *
 *   monthlySurplus   = (all inflows − all outflows) / monthsInRange. INCLUDES
 *                      one-offs: this is real cash movement inside the horizon.
 *                      `inputs` also carries eventDays: rangeDays − 1, because
 *                      the day-0 convention excludes events dated `today` while
 *                      rangeDays still counts that day — a <=0.3% understatement
 *                      over a year. NOT corrected: making rangeDays disagree
 *                      with dailyBalances.length would be a worse inconsistency
 *                      than a third of a percent, and caveatKey already labels
 *                      the short ranges where it would matter.
 *   annualEquivalent = recurringMonthlySurplus × 12, where
 *                      recurringMonthlySurplus EXCLUDES every event with
 *                      recurrence: 'oneOff' and every oneOffIn/oneOffOut event.
 *                      Annualising a one-off is §2-D7's motivating incident
 *                      ("treating the bonus as recurring overstated the annual
 *                      position by 1.5M"), and the codebase already settled
 *                      this: annualizedIncome(..., { includeOneOff = false })
 *                      defaults to excluding them (income-math.ts:100-105).
 *                      `inputs` carries excludedOneOffInflowMinor,
 *                      excludedOneOffOutflowMinor and excludedOneOffCount, so
 *                      the expansion shows exactly what was excluded and why
 *                      the two surplus figures differ.
 *   runwayMonths     = openingTotal / |monthlySurplus| — the ALL-INCLUSIVE
 *                      surplus — and null ("indefinite") when it is >= 0. The
 *                      asymmetry with annualEquivalent is deliberate and stated
 *                      in `inputs`: §2-D7 is about ANNUALISING a one-off, which
 *                      is a lie about the future, while runway is a
 *                      within-horizon cash question and a known one-off outflow
 *                      inside the horizon is real money that really leaves.
 *                      Rejected: "months until the balance hits zero" — bounded
 *                      by the horizon, so forty years of cover would read "12".
 *   firstNegativeDate= the first warning date, IGNORING dismissals — a
 *                      dismissal hides a banner, not a fact. Because
 *                      applyDismissals flags rather than filters, this always
 *                      equals negativeDays[0].date, dismissed or not.
 */
export function projectionMetrics(
  projection: Projection,
  options: ProjectionOptions
): ProjectionMetrics;
```

### `app/horizon/timeline/parseProjectionRange` (page layer, not the engine)

```ts
/** The ONLY producer of ProjectionOptions' range. Lives in the page/route
 *  layer because it reads URL input; unit-tested one case per row below. */
export function parseProjectionRange(
  searchParams: Record<string, string | string[] | undefined>,
  today: string
): { from: string; to: string; view: 'line' | 'waterfall' | 'table' };
```

| Input | Behaviour |
|---|---|
| `from` absent / malformed / not a real date (`isValidDateString`, below) | `today` |
| `from < today` | `today` — **no back-projection into the past**, which is what makes the opening balance meaningful |
| `to` absent / malformed | `addDays(sameDayNextYear(today), −1)` — 12 months |
| `to < from` | `from` (a one-day projection is valid, not an error) |
| `to − from + 1 > MAX_RANGE_DAYS` (`1826`, five years) | `addDays(from, MAX_RANGE_DAYS − 1)` |
| `view` not in `'line' \| 'waterfall' \| 'table'` | `'line'` |

Clamping `from` to `today` is what reconciles the opening balance with a `searchParams`-driven
range: without it, `?from=2027-01-01` would start 2027 from today's balance, silently, with every
number wrong. The rejected alternative — sweeping `[today, from)` internally to derive an opening
balance for a future window — is a real feature ("start the chart in March") but it belongs with
Epic E's scenario comparison, and shipping it here means a second, untested path through the sweep.

**Validation is self-contained here, and `schedule.ts` is not touched *(round-2 critique M6)*.**
Revision 1 defined the malformed-date test as `formatDate(parseDate(x)) !== x` while simultaneously
keeping both helpers module-private in `schedule.ts` "because nothing outside consumes them". Both
could not be true. So, declared beside `parseProjectionRange` and **not exported**:

- `isValidDateString(x)` — `/^\d{4}-\d{2}-\d{2}$/.test(x)` **and**
  ``new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x``, which rejects `2026-02-30` and
  `2026-13-01` as well as garbage, without importing anything.
- `MAX_RANGE_DAYS = 1826` — five years including one leap day. It lives here, not in
  `projection/types.ts`: the engine never sees it.
- `sameDayNextYear(today)` — the year incremented with the day-of-month **clamped to the target
  month's length**, so `2028-02-29 → 2029-02-28`. Previously undefined for a leap day.

`addDays` is already exported from `schedule.ts` in slice 1 and is the only import needed.

**Presets *(human-gate decision 5, confirmed consistent)*.** Default horizon **12 months** (`to`
absent → `addDays(sameDayNextYear(today), −1)`, exactly 12 months inclusive); `RangeControl` renders
**3 / 6 / 12-month** presets as `<Link>`s setting `?to=`, the 12-month one matching the default; cap
**five years**; `from` always clamped to `today`. Same four facts as the decision table, and nothing
elsewhere in this plan contradicts them.

---

## 4. Screens

| Route | Content | Stories |
|---|---|---|
| `/horizon/timeline` (real content, replaces `HorizonPlaceholder`) | Daily-balance line with zero-line shading and event markers; a waterfall view (each event a bar from prior to new balance); a table view of every event carrying date, label, amount, kind, balance before and after; the month-end/monthly-minimum pair with the minimum's exact date and a partial-month label; negative-day banner with shortfalls, suggested fixes and dismiss-with-reason; four expandable headline metrics; range presets and a view toggle | `§5-D1`–`§5-D5` |
| `/horizon/assumptions` (additive) | Same-day event-order picker — reorder the five kinds, defaulting to income → one-off in → obligations → daily expenses → one-off out | `§5-D4` |

The page follows `/horizon/page.tsx` exactly: `verifySession` → `getHouseholdId` (both redirect to
`/login`; the placeholder page is missing the second) → `createClient` → one `Promise.all`
fan-out (accounts, income streams + schedules, obligations + schedules, daily expenses, one-offs,
work calendar, holidays, settings, FX rates, dismissals) → compute `today`, parse the range with
`parseProjectionRange` → call `projectCashflow` → hand plain serializable props to presentational
components. `new Date()` lives in the page, never in the engine.

The range is driven by `searchParams` (`?from&to&view=line|waterfall|table`), validated by §3k's
table, with 3/6/12-month presets rendered as `<Link>`s and defaulting to 12 months from `today`.
This keeps the screen a pure function of the URL: no client state, no `useEffect`, which matters
because `eslint-plugin-react-hooks`' `set-state-in-effect` rule is enforced here and has already
forced a `useSyncExternalStore` workaround elsewhere in the repo.

**Components** (new, under `apps/web/src/components/horizon/timeline/`):
`{BalanceLineChart,WaterfallChart,ProjectionTable,MonthPairTable,NegativeDayBanner,HeadlineMetrics,RangeControl,ViewToggle}.tsx`.
`NegativeDayBanner` is `'use client'` (it calls the dismiss action, with `useTransition` + `useToast`
per `ObligationList`); the rest are async server components using `getTranslations`.

Both charts are hand-rolled inline SVG with a `viewBox` and `width="100%"` — never a measured pixel
width, since measuring needs a `ResizeObserver` and an effect. They carry `role="img"` plus an
`aria-label`, the `CategoryShareBar` precedent, and every one is paired with the table view of the
same data (`FxSnapshotTable`'s `scope="col"` / `overflow-x-auto` shape). Recurring vs one-off,
`confidence` and `derivation` are shown as text badges, never as colour alone (§7). Chart detail is
reachable by keyboard — focusable markers with `onFocus`, or, failing that, the table view, which is
mandatory regardless. `MonthPairTable` takes `pairs: MonthPair[]` and renders both columns
unconditionally: there is no prop that lets a caller ask for month-end alone, and a `partial: true`
row is labelled so nobody reads a 12-day stub as a month-end figure.

**Event volume, decided here rather than discovered in `qa-manual` *(round-2 critique N-f)*.**
`chargeDates` with `chargeCadence: 'daily'` emits one date **per calendar day**
(`spending-math.ts:86-94`), so five daily expenses over a 12-month horizon is ~1,825 events and
~9,000 at the five-year cap — not the "~80 events" the complexity argument is built on. The engine
copes; a 1,825-row table and a 1,825-bar waterfall do not. Two rules:
- **`ProjectionTable` rolls `dailyExpense` events up per day** into one summary row (label, count,
  summed amount, one `balanceBefore → balanceAfter` pair spanning them) inside a `<details>` that
  expands to the individual rows. Every other kind renders one row per event. The rollup is
  presentation only — `Projection.events` still carries every event, so `§5-D1`'s per-event criteria
  are untouched.
- **`WaterfallChart` aggregates same-day, same-kind events into one bar**, for every kind, so a day
  is at most five bars. This is also what makes the waterfall readable on an ordinary salary month.

**Day-0 labelling *(human-gate decision 3)*.** The opening balance is labelled rather than left to
inference, since events dated `today` are deliberately not projected. Two keys in **both** locales:
`Horizon.timeline.openingBalanceLabel` (en: "Opening balance (today)") and
`Horizon.timeline.openingBalanceNote` (en: "Today's recorded balances are the starting point.
Anything already dated today is treated as settled and isn't projected again."). The note renders
beside the opening balance and inside `HeadlineMetrics`' runway expansion, which divides by it.

**Mixed units in `ProjectionTable`.** `ProjectionEvent.amountMinor` is in the **source** currency
while `balanceBefore/AfterMinor` are in the **reporting** currency. The row shows the native amount
as primary with `≈ <converted>` as secondary — the `AccountChips` precedent — and the balance
columns carry the reporting currency in their header, so the row is never built mixing units
silently.

Reuse `StaleRateBanner` (already takes `ageDays: number`), `Button`, `useToast()`, `formatMoney`,
and the money-out/today Tailwind set (`text-ink`/`text-ink-muted`/`bg-surface`/`bg-bg`/
`border-sand-300`) rather than the assumptions set — it is the majority and the newer code.
`EventOrderPicker` follows `ReportingCurrencyPicker`'s ~25-line shape.

**i18n:** add `Horizon.timeline.*`, `Horizon.assumptions.eventOrder.*` and
`Errors.checkDismissalFields` to **both** `en.json` and `ru.json`, including the `formulaKey` and
`caveatKey` strings the metrics reference and the "not resolvable inside this horizon" /
"hold back out of whatever arrives" wordings for `suggestedDate: null` and `from: null`, the
suggestion-`scope` wording (which pot the advice is about), and
`Horizon.timeline.openingBalanceLabel` / `openingBalanceNote` for the day-0 convention. Remove
`Horizon.placeholder.timeline` and, in the same pass, the already-dead `placeholder.today` and
`placeholder.assumptions` (both screens have been real since Epics A and B), narrowing
`HorizonPlaceholder`'s `ScreenKey` to `'scenarios' | 'targetRate'`. Deletions must be in lockstep
across both locales — `src/test/messages.test.ts` fails CI on key drift.

---

## 5. Tests

| Layer | Files | What it must prove |
|---|---|---|
| Unit (node) | `lib/horizon/schedule.test.ts`, `spending/spending-math.test.ts`, `income/income-math.test.ts` (all existing) | Every existing assertion passes **unchanged** after the helper move and the `workingDaysInMonth` rewrap. If an assertion needs editing, the refactor changed behaviour and must be reverted. Plus new `workingDaysBetween` cases: a partial month, a window with no working days, a window crossing a month boundary, a sub-range within a month (`1st–15th` and `16th–end` summing to `workingDaysInMonth`), and **an inverted window (`from > to`) returning `0`** |
| Unit (node) | `projection/hourly.test.ts` | **THE MANDATORY CASE, named at the human gate**: two schedules on one stream — `dayOfMonth: 15` and `monthEnd`, both `coversPeriod: 'same'`, stream active all month — the two payment amounts sum **exactly**, to the minor unit, to B1's existing single-schedule `monthlyIncomeForStream` figure for that same stream and month. Run on a **non-integral** `rate × hours` fixture (`hourlyRateMinor: 1333`, `hoursPerDay: 7.5`), which is where independent per-sub-range rounding drifts and where revision 1's version of this test would have failed (critique N-a). **Sub-range faithfulness**: in that fixture the 15th's payment equals `hourlyIncomeForPeriod(rate, hours, workingDaysBetween(1st, 15th, calendar))` — the working days *actually worked* by the 15th, 8 of 22, explicitly not half the month — and month-end covers 16–end. **Single schedule**: a `monthEnd`-only stream is `k = 1`, spans the whole month, and equals `monthlyIncomeForStream` exactly. **The remainder rule**: `Σ amount_i === monthlyIncomeForStream(...)` across a full year and several `(rate, hours)` pairs; the corner where the last working-day-bearing sub-range is tiny is pinned as its own case, asserting non-negativity. **Partition before filter**: a 15th-and-month-end stream whose 15th falls before `rangeFrom` still gives the month-end payment the **16–end** sub-range, not the whole month — without this the payment is ~2× too large. **Slippage independence** (supersedes round 2's M1): a `monthEnd` stream with `nextBusinessDay` whose 31 Jan pay date is a Saturday lands 2 Feb with the range starting 1 Feb — asserted twice, once for presence and amount, once as an invariant against the same fixture with `slippagePolicy: 'none'`, proving the amount does not depend on slippage. **Zero-occurrence month** (§8 Q1b's specified consequence): a quarterly `everyNDays: 90` stream disburses only its covered months and the other two produce nothing — asserting the *specified* behaviour, which changes if the gate answers Q1b differently. **`coversPeriod: 'next'`**: an August payment covering September is dated in August, carries September's total, anchors by clamped day-of-month; two occurrences collapsing onto one anchor yield one event and the month still sums to `monthlyIncomeForStream` (§8 Q1e). **`endDate`** (decision 2): a stream ending 10 Jan paid month-end still emits its 31 Jan payment for `2026-01` at January's **full** total, and its 28 Feb occurrence emits nothing. **Degenerate**: `hoursPerDay: 0` emits nothing; a month with no working days emits nothing; an inverted sub-range yields `workingDaysBetween === 0` and no event. **Non-negativity** holds on every generated amount |
| Unit (node) | `projection/events.test.ts` | `startDate`/`endDate` clamping per entity, evaluated against the **unslipped** date. **Slippage across the range edge**: a `dayOfMonth: 31` + `nextBusinessDay` obligation whose 31 Jan due date is a Saturday appears on 2 Feb for a range starting 1 Feb; its mirror — an occurrence that slips past `to` — is absent from `events` entirely. **Archived**: an archived stream, obligation and daily expense each produce zero events; an event whose account is archived is dropped. Zero-amount events are not emitted; **two schedules on one entity generating the same unslipped date produce TWO events** (critique N-g — dedup is on `(sourceId, scheduleId, originalDate)`, so a deliberate "half on the 1st, half on the 15th" split is never halved); two distinct unslipped dates slipping onto one day produce two. **Day 0** (decision 3): an obligation dated `today` produces **no** event, the same obligation dated `today + 1` does, and an hourly payment landing on `today` is excluded too. A one-off `in`/`out` gets the right sign, kind and `derivation: 'entered'`; a monthly-cadence daily expense charges `daily × daysInMonth` with `derivation: 'accrualCharge'` while a **`daily`-cadence** one carries `derivation: 'entered'` (critique N-i) |
| Unit (node) | `projection/projection.test.ts` | One `DailyBalance` per day, no gaps, no duplicates; `balanceBefore`/`balanceAfter` chain exactly; two identical calls are deeply equal; reordering `options.order` flips two same-day events and can flip a day's sign; a missing FX rate flags and excludes rather than throwing, with the event still present and `balanceBefore === balanceAfter`; an **archived account** contributes nothing to `openingTotalMinor` and has no `AccountDayBalance` row; `monthPoints` reports a month whose end is positive but whose minimum is negative, and a truncated first/last month carries `partial: true`; `from` earlier than `today` is clamped rather than throwing; **`dailyBalances[0].totalMinor === openingTotalMinor`** because events dated `today` are excluded (decision 3) while the day itself is still a row. **Performance, envelope corrected (critique N-f):** two cases — (i) 365 days × ~80 events, the happy path, and (ii) **`MAX_RANGE_DAYS = 1826` with five `chargeCadence: 'daily'` expenses**, ~9,000 events, the largest input reachable through the URL. Both against a **generous 2 s ceiling** plus deterministic proxies (`generateDates` calls ≤ one per schedule per entity; `workingDaysBetween` day-evaluations per stream-month ≤ that month's length) — a wall-clock sub-200 ms assertion on shared CI runners is a flake generator; the real measured timings go in the PR body |
| Unit (node) | `projection/metrics.test.ts` | No metric is `NaN` or `Infinity` for a `from === to` range, which instead yields finite numbers and `caveatKey: 'shortRange'`; `annualEquivalentMinor` over a 12-month range containing a 500,000 one-off bonus is exactly 500,000 lower than the naive figure, and `inputs` names the excluded amount and count; runway is `null` on a non-negative all-inclusive surplus; `firstNegativeDate` agrees with `negativeDays[0].date` even when that day is dismissed; every metric carries its `inputs` and `formulaKey` |
| Unit (node) | `projection/warnings.test.ts` | A +200,000 total with one `includeInTotal` account at −124,600 **does** warn, with `trigger: 'account'`, and **its suggestions carry `scope: { kind: 'account', … }`, are computed over that account's own series in its own currency, and only name that account's events** (critique M2); a **non-`includeInTotal`** account closing negative does **not** warn (M3); an account whose **opening** balance is already negative never fires the account trigger (N-h); when the only offender is unconvertible, `shortfallMinor` is its native shortfall and `shortfallCurrency` its own currency, with no `NaN` and no throw (N-h). Every warning yields 1–3 suggestions per scope and never zero; a day with no preceding inflow — and a projection whose first day is negative from a negative opening balance — still returns `holdBack` with `from: null`; `shiftPayment` with no landing date that clears the run returns `suggestedDate: null` rather than being omitted or throwing, **and a later unrelated negative day elsewhere in the horizon does NOT make it null** — a fixture with a fixable March dip and an independent November dip returns a real date for March (M4); `bringForward` is emitted only when it clears the whole negative run and its `toDate` is the run's **first** day (N-h); `holdBack.amountMinor` equals the run's worst shortfall; **two adjacent days of one run carry identical suggestion arrays** (N-h, per-run computation); two runs produce byte-identical suggestion arrays ordered by reference-date distance, then amount desc, then `id`; a dismissal suppresses, a worsened shortfall re-surfaces, a changed reporting currency re-surfaces, and dismissed days are **flagged, not removed** |
| Unit (node) | `parseProjectionRange.test.ts` | One case per row of §3's table: `from` clamped to `today`, malformed dates rejected, `to < from`, the five-year cap, the `view` fallback. Plus `isValidDateString` rejecting `2026-02-30`, `2026-13-01`, `26-01-01` and `''` while accepting `2026-02-28`; `sameDayNextYear('2028-02-29') === '2029-02-28'`; the default range being exactly 12 months inclusive and the 3/6/12 preset links producing the stated lengths (decision 5). **No import from `schedule.ts` beyond `addDays`** (critique M6) |
| Unit (node) | `queries/projection.test.ts`, `mutations/projection.test.ts`, `app/actions/horizon-projection.test.ts` | Household scoping via `fake-supabase.ts`; upsert on `(household_id, negative_date)` replaces rather than duplicates; `dismissNegativeDay` also deletes rows whose `negative_date < today`; unauthenticated → error; empty reason → error with **no** DB call; success → `revalidatePath('/horizon/timeline')` |
| jsdom | `MonthPairTable.test.tsx`, `NegativeDayBanner.test.tsx`, `HeadlineMetrics.test.tsx`, `ProjectionTable.test.tsx`, `BalanceLineChart.test.tsx`, `EventOrderPicker.test.tsx` | Both month figures render together with the minimum's date and a partial-month label; the banner lists every negative date with its shortfall and suggestions, renders the `null` suggestedDate and `null` holdBack source in words, and refuses an empty reason; each metric expands to its inputs, formula and caveat; the table carries every `§5-D1` field per event plus the `derivation` badge, with the native amount primary and `≈ converted` secondary; the chart emits a `viewBox`, `role="img"` and an `aria-label`, and no fixed pixel width; the order picker round-trips a reorder |
| pgTAP | `supabase/tests/database/horizon_projection_dismissals.sql` | Member reads/writes own household; non-member reads zero rows; the reason-length, positive-shortfall and currency checks reject bad input; the unique `(household_id, negative_date)` constraint holds; cascade delete from household |
| Integration | `src/test/integration/horizon-projection.itest.ts` | Constraints and the upsert verified against real Postgres through a per-user JWT; the `households_horizon_event_order_valid` permutation check rejects a four-element and a duplicated order |

Add `projectionDismissal` (and, in the slice that first uses it, a `projectionEvent`) factory to
`src/test/factories.ts`, using the widened
`Partial<Omit<T, moneyFields>> & { moneyField?: number }` signature — the plain `Partial<T>` form
doesn't typecheck against branded `Money` when a test passes a plain number. Per Epic C's
experience, **do not add a factory before the slice whose test calls it**: `knip` is CI-enforced
and already cost two Epic C slices a round trip.

---

## 6. Delivery

Cut fresh off updated `origin/main`. One PR per slice, ordered types debt → refactor → engine →
derivations → schema → order UI → screens. Slices 2 and 3 stack deliberately on 1 (they need the
shared date helpers and `workingDaysBetween`); everything after branches from `main` once its
predecessor merges.

Docker and local Supabase **are** available in this environment (verified 2026-08-22), so unlike
Epics B and C no slice may claim a DB gap without an actual failure to point at. `supabase db
reset`, `pnpm gen:types`, `pnpm test:db`, `pnpm test:integration` and a real browser walkthrough
are part of the gate, not a deferred aspiration.

| # | Branch / title | Contents | Status |
|---|---|---|---|
| 0 | `chore: regenerate database.types.ts from migrations` | `supabase db reset` + `pnpm gen:types`, the regenerated `database.types.ts` committed **alone**. Clears the inherited debt (local DB at 0020; the file hand-edited for 0020 and 0021) and is the first run in this project's history to exercise CI's types-match gate against those hand-edits. Deliberately not bundled with slice 1, whose safety argument is "every existing assertion passes unchanged" — an unknown-risk regeneration would destroy that signal. Budget for a noisy first diff | ☐ Not started |
| 1 | `refactor: share horizon date and working-day helpers` | `schedule.ts` exports `addDays`/`monthsBetween` and **gains `daysBetween`, moved from `spending-math.ts:219`** (it does not exist in `schedule.ts` today — this is a move plus an addition, not a pure export). `parseDate`/`formatDate` stay module-private: nothing outside consumes them and an unconsumed export fails knip. `spending-math.ts` deletes its verbatim copies and imports them; `income-math.ts` gains `workingDaysBetween` (0 for an inverted window) with `workingDaysInMonth` rewrapped over it. No new tables, no new screens; every existing assertion passes unchanged | ☐ Not started |
| 2 | `feat: add horizon projection engine` | `projection/{types,hourly,events,projection}.ts` + `schedule.ts`'s `monthBounds` (consumed in this slice by **both** `hourly.ts` and `projection.ts` — correcting critique N-i). `types.ts` ships **only** the slice-2 half of the type list (§3): the warning/metric types wait for slice 3 or knip fails (critique M7). Unit tests as §5: the hourly mandatory sum-to-`monthlyIncomeForStream` case, the sub-range partition, the remainder rule, partition-before-filter, slippage independence, the padded-window slippage edges, day-0 exclusion, the archived-entity cases, determinism, and both performance cases. `hourlyPaymentsForStream` takes `Extract<IncomeStream, { kind: 'hourly' }>` and adds no export to `income/types.ts` (critique M5). Pure; no DB, no UI. **Smaller than in revision 1** — the accrual model's cumulative machinery is gone | ☐ Not started |
| 3 | `feat: add horizon projection metrics and warnings` | `projection/{metrics,warnings}.ts` + the slice-3 half of `projection/types.ts` — `AVERAGE_DAYS_PER_MONTH`, `NegativeDay`, `Suggestion`, `SuggestionScope`, `SuggestionOptions`, `ProjectionDismissal`, `MetricWithInputs`, `ProjectionMetrics` — declared **here**, alongside their only consumers, because knip reports unconsumed exported types and a slice-2 test cannot construct a `Suggestion` whose producer doesn't exist (critique M7). Tests: `§5-D5`'s four metrics with inputs, `formulaKey` and `caveatKey`; `§5-D3`'s total-or-account detection with the scope, overdraft-suppression and unconvertible-offender cases, the three exact suggestion algorithms with their null cases and M4's independent-dips fixture, per-run sharing, ranking determinism and dismissal reconciliation. Still pure; still no DB, no UI | ☐ Not started |
| 4 | `feat: add horizon projection schema` | Migration 0022 (dismissals table + `households.horizon_event_order`), `projection/{mappers,validation}.ts`, `queries/projection.ts`, `mutations/projection.ts` (including the `negative_date < today` cleanup), `app/actions/horizon-projection.ts`, **`HorizonSettings.eventOrder` added to `lib/horizon/types.ts` in this slice** with `queries/settings.ts` + `lib/horizon/mappers.ts` as its consumers (critique M7), `pnpm gen:types` on top of 0022, pgTAP + integration tests. No UI | ☐ Not started |
| 5 | `feat: add horizon event order picker` | `mutations/settings.ts`'s `setHorizonEventOrder`, `app/actions/horizon-settings.ts`'s `setEventOrder`, and `components/horizon/assumptions/EventOrderPicker.tsx` on `/horizon/assumptions` — mutation and its only consumer in **one** slice, so no export waits three PRs for a caller (knip) | ☐ Not started |
| 6 | `feat: show horizon timeline` | `/horizon/timeline` real content: the page's query fan-out, `parseProjectionRange` with its test, `BalanceLineChart`, `ProjectionTable`, `MonthPairTable`, `RangeControl`, `ViewToggle`, `StaleRateBanner`, i18n, and the `HorizonPlaceholder` `ScreenKey` narrowing with the three dead placeholder keys removed from both locales | ☐ Not started |
| 7 | `feat: warn on projected negative days` | `NegativeDayBanner` on the same screen: every negative date with its shortfall and `trigger`, the ranked suggestions including their null cases, dismiss-with-reason and undismiss wired to the slice-4 actions, plus the re-surfacing behaviour end to end | ☐ Not started |
| 8 | `feat: add horizon timeline metrics and waterfall` | `HeadlineMetrics` with a `<details>` per metric showing its inputs, `formulaKey` formula and `caveatKey` (`§5-D5`/G2), and the `WaterfallChart` view showing the running balance between same-day events (`§5-D4`) | ☐ Not started |

Update `PLAN.md` §9 as each slice lands — one paragraph per slice, same voice — and run
`graphify update .` after code changes.

---

## 7. Verification

Per slice, the same gate as Epics A–C, with the DB half **actually required**: Docker and local
Supabase are up in this environment, so every command below runs for real and its genuine result is
reported.

```bash
pnpm format:check && pnpm lint && pnpm knip && pnpm typecheck && pnpm test
supabase start
supabase db reset
pnpm gen:types && git diff --exit-code apps/web/src/lib/supabase/database.types.ts
pnpm test:db
pnpm test:integration
pnpm build
```

**End-to-end, by hand** (`pnpm dev`, signed in, at ≥1024px — the Horizon layout is desktop-gated):

1. After slice 0, confirm `git diff --exit-code` on `database.types.ts` is clean and CI's DB block
   fired. After slice 1, open `/horizon/money-in` and `/horizon/money-out` and confirm the derived
   monthly income, the six-date schedule preview, the struck-through slipped date, the 28/30/31-day
   totals and the cap tracker are all byte-identical to before. The refactor must be invisible.
2. Open `/horizon/timeline`. Confirm the placeholder is gone, the default range is 12 months from
   today, and the daily-balance line renders with a visible zero line and event markers.
3. Edit the URL to `?from=2020-01-01` and confirm the range starts at **today**, not 2020; then
   `?from=2027-01-01` and confirm the same; then `?to=2099-01-01` and confirm it caps at five years;
   then `?view=nonsense` and confirm the line view renders (§3k).
4. Switch to the table view. Confirm every event row carries date, label, amount, kind, balance
   before and balance after (`§5-D1`), the native amount with `≈ converted` beside it, and the
   `derivation` badge — resize the browser and confirm the SVG scales without a horizontal
   scrollbar or a clipped axis.
5. Check the month table: every row shows **both** the month-end balance and the monthly minimum
   with the minimum's exact date (`§2-D2`/`§5-D2`), and a truncated first or last month is labelled
   partial. Confirm no view anywhere shows month-end on its own.
6. Archive an obligation and a daily expense, and archive an account with a balance. Reload and
   confirm all three vanish from the Timeline entirely — no events, no opening-balance
   contribution, no per-account row — while still appearing on their own list screens.
7. Add a large obligation dated the same day as your salary. With the default order, confirm the
   salary's `balanceAfter` equals the obligation's `balanceBefore` and the day stays positive.
   Then, on `/horizon/assumptions`, move `obligation` above `income`, reload the Timeline, and
   confirm the two events swap and the day now reads negative (`§5-D4`).
8. With that day negative, confirm the banner lists the date and the shortfall, and offers a
   nearest fix naming a real event and date (`§5-D3`). Then push the household into a structural
   deficit and confirm `shiftPayment` says "not resolvable inside this horizon" in words rather
   than disappearing, and that `holdBack` still appears when nothing precedes the negative date.
   Dismiss with a reason; reload and confirm it stays dismissed.
9. Make a single account negative while the household total stays positive, and confirm the banner
   still warns, naming that account (`§2-D2`'s literal scenario) — **and that the suggestion talks
   about that account's own balance and currency, not the household total** (critique M2). Then set
   an account's *current* balance negative (an overdraft) and confirm it does **not** produce a
   warning on every day of the horizon (critique N-h). Then mark an account `includeInTotal = false`,
   make it negative, and confirm it does not warn at all (critique M3).
10. Increase that obligation's amount so the shortfall worsens, reload, and confirm the warning
    **re-surfaces** despite the earlier dismissal. Change the reporting currency and confirm the
    same. Undismiss and confirm it returns to the list.
11. **The human gate's named case.** Add an hourly income stream with **two** schedules — the 15th
    and month end — both `coversPeriod = same`, fully active for the month, and give it a
    non-round rate (13.33/hr × 7.5h/day). Confirm the two Timeline payments sum to **exactly** the
    monthly figure on `/horizon/money-in` for that month, to the minor unit, and that the **15th's
    payment reflects the working days actually worked by the 15th** (8 of 22, say) rather than half
    the month. Then delete the 15th schedule and confirm the single month-end payment equals that
    same monthly figure on its own.
12. Set an `endDate` of the 10th on that stream. Confirm the month-end payment **still appears**,
    settling work done before the end date (decision 2), that it carries January's **full** figure
    rather than a prorated 1–10 (§8 Q1c — the flagged consequence), and that nothing is emitted in
    the following month.
13. Add an hourly stream on an `everyNDays: 90` schedule. Confirm its quarterly payment carries
    **one** month's working days — the month it covers — and that the other two months disburse
    nothing. This is §8 **Q1b**'s specified consequence; if it looks wrong on screen, that is the
    gate question, not a bug report.
14. Set `coversPeriod = next` on a rent obligation due the 28th and confirm the Timeline moves cash
    on the 28th (or its slipped date) while labelling the period as the *following* month — the
    covered period must never move the money.
15. Set a `dayOfMonth: 31` obligation with `nextBusinessDay` whose due date falls on a weekend just
    before the range start, and confirm the payment appears on its slipped, in-range date rather
    than vanishing.
16. **Hourly slippage independence (the old M1 case).** Give the hourly stream a `monthEnd` schedule
    with `nextBusinessDay` and pick a month whose last day is a Saturday, with the range starting
    the 1st of the following month. Confirm the payment appears on the **Monday**, inside the range,
    carrying the covered month's full amount — then switch the policy to `none` and confirm the
    **amount is identical** while only the date moves.
17. **Day 0 (decision 3).** Note today's opening balance, then add an obligation dated **today**.
    Reload and confirm the first day's balance is **unchanged** and no event appears for it, and
    that the on-screen note explains why. Move the obligation to tomorrow and confirm it now appears
    and moves the balance.
18. **Split payment not halved (critique N-g).** Give one obligation two schedules resolving to the
    same date — `dayOfMonth: 31` and `monthEnd` — and confirm the Timeline shows **two** events that
    day, not one.
19. **Daily-expense volume (critique N-f).** Add three `chargeCadence: 'daily'` expenses over a
    12-month range. Confirm the table shows one rolled-up row per day, expandable to the individual
    charges, and that the waterfall shows one bar per kind per day rather than hundreds. Then set
    `?to=` five years out and confirm the page still renders in reasonable time.
20. Add an obligation in a currency with no FX snapshot. Confirm the Timeline flags it as
    unconvertible and still lists it, that its balance before and after are equal, that the totals
    exclude it rather than the page erroring, and that the stale-rate banner appears when the
    oldest rate used is over 30 days old.
21. Check the four headline metrics. Expand each and confirm the inputs, formula and any caveat are
    shown (`§5-D5`/G2). Narrow the range to a single day and confirm no metric reads `NaN` or
    `Infinity` and each carries the short-range caveat. Add a large one-off bonus and confirm the
    annual equivalent does **not** move while the monthly surplus does, with the excluded amount
    named in the expansion. Confirm runway reads "indefinite" for a surplus household and a real
    figure once the monthly position is negative, and that the first-negative date matches the
    banner's first entry even when that date is dismissed.
22. Switch to the waterfall view and confirm each event reads as a bar from its prior to its new
    balance, and that a multi-event day shows the running balance between them (`§5-D4`).
23. Tab through the Timeline: confirm every chart detail is reachable without a mouse, and that no
    piece of meaning — recurring vs one-off, entered vs derived, inflow vs outflow, negative vs
    positive — is carried by colour alone (§7).
24. Reload the Timeline twice and confirm the numbers are identical, then confirm the same by
    adding an older FX snapshot in Studio and reloading — a *new historical* rate must not change a
    projection pinned to today (`§2-D11`).

---

## 8. Risks

- **A covered month that no occurrence covers is never disbursed** — the quarterly `everyNDays: 90`
  contractor sees one month's income per quarter on the Timeline and three on `/horizon/money-in`.
  This is the **largest residual product risk in the epic** and it is a *consequence of the settled
  model*, not a choice this plan made: the fix would be re-introducing "everything since the last
  payment", which the human gate rejected. It needs a human answer before slice 2 merges (open
  question Q1b). Mitigated meanwhile by keeping the whole rule inside `hourly.ts`, so a different
  answer changes one file and the sweep is untouched.
- **Partial months are not prorated.** A stream starting 20 Jan or ending 10 Jan disburses a full
  January, because `monthlyIncomeForStream` ignores `startDate`/`endDate` (`income-math.ts:61-73`)
  and the gate said to use the existing math. Both screens agree, which makes the overstatement
  consistent rather than contradictory — and therefore easy to miss (Q1c).
- **Mixed `coversPeriod` across one stream's schedules roughly doubles its income** — 15 Jan
  disburses February in full and 31 Jan disburses January in full. Accepted as configured-rather-
  than-inferred, but silent, and the schema permits it (Q1d). Note this replaces revision 1's
  opposite failure, where the monotone `max()` clamp silently *deleted* one of the two paydays.
- **The `'next'`/`'previous'` anchor mapping is not injective** — two occurrences can collapse onto
  one sub-range boundary, so one configured payday emits nothing. Money is conserved by the
  remainder rule; visibility is not (Q1e).
- **The partition-before-filter rule is the one thing an implementer can silently break.** Form a
  covered-month group after the range filter and a 15th-and-month-end stream near the range edge is
  overstated ~2× while every other test still passes. §5 asserts it directly.
- **The Money-in / Timeline divergence is much smaller than in revision 1** — both screens now call
  `monthlyIncomeForStream`, so they agree exactly on any covered month with an occurrence — but it
  is not zero: Q1b's uncovered months and `coversPeriod`'s one-month shift remain. Reconciling the
  two screens is a logged follow-up, not this epic's work.
- **Daily-cadence expenses reach ~9,000 events at the five-year cap.** The engine is fine; the UI
  needs §4's per-day rollup and same-day bar aggregation, and §5 tests the envelope at that size
  rather than at 365 days.
- Revision 1's "400-day hourly lookback is a bound, not a proof" risk is **gone**:
  `HOURLY_GROUP_PAD_DAYS = 92` is proved sufficient from `coveredPeriod`'s ±1-month range.
- **Slice 1 touches shipped Epic B and C pure modules.** Behaviour-preserving by construction —
  helpers move, `workingDaysInMonth` becomes a wrapper — and the proof is that `schedule.test.ts`,
  `spending-math.test.ts` and `income-math.test.ts` move across with their assertions unedited. If
  an assertion needs changing, the refactor changed behaviour and must be reverted. That signal is
  only clean because slice 0 took the `gen:types` risk out of it.
- **`gen:types` drift is unknown until it runs.** `database.types.ts` was hand-edited for 0020 and
  0021 and the CI gate that checks it has never fired. The hand-edit may be wrong and the CLI may
  reformat the whole file. Slice 0 absorbs both, alone, rather than letting either surprise a later
  slice.
- **Two conversions per event doubles the missing-rate surface** (event → account currency, account
  → reporting currency). Mitigated by the never-throw discipline copied from `summarizeToday` and
  by surfacing unconvertible events explicitly rather than dropping them, which is `§2-D14`/G1
  anyway.
- **Inline SVG is greenfield here** — the only `<svg>` in `src` is the icon set, and there is no
  responsive-width JS anywhere. A `viewBox` plus `width="100%"` is the only approach that doesn't
  require a `ResizeObserver` and an effect, which `set-state-in-effect` forbids. Mitigated further
  by the mandatory table view: if the chart is plain, the screen is still complete and accessible.
- **`knip` has already cost two Epic C slices.** No export lands before the slice that consumes it,
  factories included; test consumption counts. §3's per-helper consumer table and slice 5's
  pairing of `setHorizonEventOrder` with `EventOrderPicker` exist for exactly this reason.
  `pnpm knip` before every push.
- **Migrations must stay backward compatible with the previous release** — release-please runs
  `supabase db push` before `vercel deploy --prod`. 0022 is a new table plus an
  add-nullable/backfill/constrain column change, both additive and safe against Epic C's code.
- **`queries/fx.ts` returns every FX snapshot with no household filter and no limit.** Fine today;
  the Timeline inherits that cost on every render, and it grows with the rates table. Worth
  watching, not worth fixing in this epic.
