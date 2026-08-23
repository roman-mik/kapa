/**
 * Horizon scenario mutations: CRUD for scenarios, their diffs, and their
 * scenario-scoped one-off events. Same idiom as
 * `@/lib/horizon/mutations/spending`.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { Scenario, ScenarioDiff } from '../scenarios/types';
import {
  toScenario,
  toScenarioDiff,
  type HorizonScenarioDiffRow,
  type HorizonScenarioOneOffRow,
  type HorizonScenarioRow,
} from '../scenarios/mappers';
import type {
  ScenarioCreateInput,
  ScenarioDiffUpsertInput,
  ScenarioUpdateInput,
} from '../scenarios/validation';

const SCENARIO_COLUMNS = 'id, name, sort_order';

const SCENARIO_DIFF_COLUMNS =
  'id, scenario_id, entity_type, entity_id, field, value_json, effective_date';

const SCENARIO_ONE_OFF_COLUMNS =
  'id, scenario_id, account_id, name, category, amount_minor, currency, date, direction';

/** New scenarios are appended after the current highest `sort_order`. */
export async function createScenario(
  supabase: SupabaseServerClient,
  householdId: string,
  input: ScenarioCreateInput
): Promise<Scenario> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const { data: last, error: sErr } = await supabase
      .from('horizon_scenarios')
      .select('sort_order')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    sortOrder = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('horizon_scenarios')
    .insert({
      household_id: householdId,
      name: input.name,
      sort_order: sortOrder,
    })
    .select(SCENARIO_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toScenario(data as HorizonScenarioRow);
}

export async function updateScenario(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  input: ScenarioUpdateInput
): Promise<Scenario | null> {
  const patch: Partial<HorizonScenarioRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await supabase
    .from('horizon_scenarios')
    .update(patch)
    .eq('id', id)
    .eq('household_id', householdId)
    .select(SCENARIO_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toScenario(data as HorizonScenarioRow) : null;
}

/** Deletes a scenario and (via `on delete cascade`) its diffs and one-offs. */
export async function deleteScenario(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('horizon_scenarios')
    .delete()
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data !== null;
}

/** Copies a scenario's diffs and one-offs onto a newly created scenario —
 *  "duplicate" without ever duplicating the underlying income/spending data
 *  the diffs point at. */
export async function duplicateScenario(
  supabase: SupabaseServerClient,
  householdId: string,
  id: string,
  newName: string
): Promise<Scenario> {
  const [
    { error: sErr },
    { data: diffs, error: dErr },
    { data: oneOffs, error: oErr },
  ] = await Promise.all([
    supabase
      .from('horizon_scenarios')
      .select(SCENARIO_COLUMNS)
      .eq('id', id)
      .eq('household_id', householdId)
      .single(),
    supabase
      .from('horizon_scenario_diffs')
      .select(SCENARIO_DIFF_COLUMNS)
      .eq('scenario_id', id)
      .eq('household_id', householdId),
    supabase
      .from('horizon_scenario_one_offs')
      .select(SCENARIO_ONE_OFF_COLUMNS)
      .eq('scenario_id', id)
      .eq('household_id', householdId),
  ]);

  if (sErr) throw new Error(sErr.message);
  if (dErr) throw new Error(dErr.message);
  if (oErr) throw new Error(oErr.message);

  const created = await createScenario(supabase, householdId, {
    name: newName,
  });

  const diffRows = (diffs ?? []) as HorizonScenarioDiffRow[];
  if (diffRows.length > 0) {
    const { error } = await supabase.from('horizon_scenario_diffs').insert(
      diffRows.map((d) => ({
        household_id: householdId,
        scenario_id: created.id,
        entity_type: d.entity_type,
        entity_id: d.entity_id,
        field: d.field,
        value_json: d.value_json,
        effective_date: d.effective_date,
      }))
    );
    if (error) throw new Error(error.message);
  }

  const oneOffRows = (oneOffs ?? []) as HorizonScenarioOneOffRow[];
  if (oneOffRows.length > 0) {
    const { error } = await supabase.from('horizon_scenario_one_offs').insert(
      oneOffRows.map((o) => ({
        household_id: householdId,
        scenario_id: created.id,
        account_id: o.account_id,
        name: o.name,
        category: o.category,
        amount_minor: o.amount_minor,
        currency: o.currency,
        date: o.date,
        direction: o.direction,
      }))
    );
    if (error) throw new Error(error.message);
  }

  return created;
}

/** Upserts one diff row keyed on `(scenario_id, entity_type, entity_id,
 *  field)`, so re-editing the same field updates in place. */
export async function upsertScenarioDiff(
  supabase: SupabaseServerClient,
  householdId: string,
  scenarioId: string,
  input: ScenarioDiffUpsertInput
): Promise<ScenarioDiff> {
  const { data, error } = await supabase
    .from('horizon_scenario_diffs')
    .upsert(
      {
        household_id: householdId,
        scenario_id: scenarioId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        field: input.field,
        value_json: input.value,
      },
      { onConflict: 'scenario_id,entity_type,entity_id,field' }
    )
    .select(SCENARIO_DIFF_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return toScenarioDiff(data as HorizonScenarioDiffRow);
}

