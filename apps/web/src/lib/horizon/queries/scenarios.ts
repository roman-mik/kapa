/**
 * Horizon scenario queries. Same idiom as `@/lib/horizon/queries/spending`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type {
  Scenario,
  ScenarioDiff,
  ScenarioOneOff,
} from '../scenarios/types';
import {
  toScenario,
  toScenarioDiff,
  toScenarioOneOff,
  type HorizonScenarioDiffRow,
  type HorizonScenarioOneOffRow,
  type HorizonScenarioRow,
} from '../scenarios/mappers';

const SCENARIO_COLUMNS = 'id, name, sort_order';

const SCENARIO_DIFF_COLUMNS =
  'id, scenario_id, entity_type, entity_id, field, value_json, effective_date';

const SCENARIO_ONE_OFF_COLUMNS =
  'id, scenario_id, account_id, name, category, amount_minor, currency, date, direction';

export async function getScenarios(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from('horizon_scenarios')
    .select(SCENARIO_COLUMNS)
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonScenarioRow[]).map(toScenario);
}

/** All diffs across every scenario in the household, in one round trip —
 *  used by the comparison view (E3), which needs several scenarios at once. */
export async function getAllScenarioDiffs(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<ScenarioDiff[]> {
  const { data, error } = await supabase
    .from('horizon_scenario_diffs')
    .select(SCENARIO_DIFF_COLUMNS)
    .eq('household_id', householdId);

  if (error) throw new Error(error.message);
  return (data as HorizonScenarioDiffRow[]).map(toScenarioDiff);
}

/** All scenario-scoped one-offs in the household, in one round trip — see
 *  `getAllScenarioDiffs`. */
export async function getAllScenarioOneOffs(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<ScenarioOneOff[]> {
  const { data, error } = await supabase
    .from('horizon_scenario_one_offs')
    .select(SCENARIO_ONE_OFF_COLUMNS)
    .eq('household_id', householdId)
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as HorizonScenarioOneOffRow[]).map(toScenarioOneOff);
}
