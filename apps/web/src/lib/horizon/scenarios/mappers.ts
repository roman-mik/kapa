/**
 * Row -> domain mappers for Horizon scenarios, same idiom as
 * `@/lib/horizon/spending/mappers`.
 */
import type { Currency, Money } from '@/lib/types';
import type { Database } from '@/lib/supabase/database.types';
import type { OneOffCategory, OneOffDirection } from '@/lib/horizon/spending/types';
import type {
  Scenario,
  ScenarioDiff,
  ScenarioEntityType,
  ScenarioOneOff,
} from './types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type HorizonScenarioRow = Row<'horizon_scenarios'>;
export type HorizonScenarioDiffRow = Row<'horizon_scenario_diffs'>;
export type HorizonScenarioOneOffRow = Row<'horizon_scenario_one_offs'>;

const money = (n: number): Money => n as Money;

export function toScenario(row: HorizonScenarioRow): Scenario {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

export function toScenarioDiff(row: HorizonScenarioDiffRow): ScenarioDiff {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    entityType: row.entity_type as ScenarioEntityType,
    entityId: row.entity_id,
    field: row.field,
    value: row.value_json as number | boolean,
    effectiveDate: row.effective_date,
  };
}

export function toScenarioOneOff(row: HorizonScenarioOneOffRow): ScenarioOneOff {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    accountId: row.account_id,
    name: row.name,
    category: row.category as OneOffCategory,
    amountMinor: money(row.amount_minor),
    currency: row.currency as Currency,
    date: row.date,
    direction: row.direction as OneOffDirection,
  };
}
