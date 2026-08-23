/**
 * Horizon Epic E domain types (camelCase), same idiom as
 * `@/lib/horizon/spending/types`. A scenario is a named set of diffs on the
 * baseline, never a copy of it — there is no baseline row anywhere in this
 * module; "baseline" is simply the live data with zero diffs applied.
 */
import type { Currency, Money } from '@/lib/types';
import type {
  OneOffCategory,
  OneOffDirection,
} from '@/lib/horizon/spending/types';

export interface Scenario {
  id: string;
  name: string;
  sortOrder: number;
}

export type ScenarioEntityType = 'incomeStream' | 'obligation' | 'dailyExpense';

/** The fields E1/B5 can override, per entity type. `archived` on an income
 *  stream is B5's "toggle a stream on/off within a scenario". */
export const SCENARIO_DIFF_FIELDS: Record<
  ScenarioEntityType,
  readonly string[]
> = {
  incomeStream: [
    'hourlyRateMinor',
    'hoursPerDay',
    'fixedAmountMinor',
    'archived',
  ],
  obligation: ['amountMinor', 'archived'],
  dailyExpense: ['dailyAmountMinor', 'capMinor', 'archived'],
};

export interface ScenarioDiff {
  id: string;
  scenarioId: string;
  entityType: ScenarioEntityType;
  entityId: string;
  field: string;
  /** Money fields are minor-unit numbers; `archived` is a boolean. */
  value: number | boolean;
  /** `YYYY-MM-DD`, unused until E4 (P2) — always null for now. */
  effectiveDate: string | null;
}

/** Mirrors `OneOffEvent`, scoped to a scenario (D13: a transition carries its
 *  own dated one-off costs and refunds). */
export interface ScenarioOneOff {
  id: string;
  scenarioId: string;
  accountId: string;
  name: string;
  category: OneOffCategory;
  amountMinor: Money;
  currency: Currency;
  date: string;
  direction: OneOffDirection;
}
