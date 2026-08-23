/**
 * Household-level horizon settings mutation — currently just the reporting
 * currency. Changing it never rewrites any stored `current_balance_minor` or
 * `currency` on an account (D15) — it only changes what unit totals convert
 * into at read time.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type {
  HorizonSettings,
  HorizonTaxSettings,
  ProjectionEventKind,
} from '../types';
import { toHorizonSettings, toHorizonTaxSettings } from '../mappers';
import type { HorizonSettingsUpdateInput } from '../validation';
import type { HorizonTaxSettingsUpdateInput } from '../target-rate/validation';

export async function updateHorizonReportingCurrency(
  supabase: SupabaseServerClient,
  householdId: string,
  input: HorizonSettingsUpdateInput
): Promise<HorizonSettings | null> {
  const { data, error } = await supabase
    .from('households')
    .update({ horizon_reporting_currency: input.reportingCurrency })
    .eq('id', householdId)
    .select('horizon_reporting_currency, horizon_event_order')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toHorizonSettings(data) : null;
}

/** F1/F3's tax policy — see 0024_horizon_tax_settings.sql. */
export async function updateHorizonTaxSettings(
  supabase: SupabaseServerClient,
  householdId: string,
  input: HorizonTaxSettingsUpdateInput
): Promise<HorizonTaxSettings | null> {
  const { data, error } = await supabase
    .from('households')
    .update({
      horizon_tax_fixed_monthly_minor: input.fixedMonthlyMinor,
      horizon_tax_marginal_rate_bps: input.marginalRateBps,
    })
    .eq('id', householdId)
    .select('horizon_tax_fixed_monthly_minor, horizon_tax_marginal_rate_bps')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toHorizonTaxSettings(data) : null;
}

export async function setHorizonEventOrder(
  supabase: SupabaseServerClient,
  householdId: string,
  eventOrder: ProjectionEventKind[]
): Promise<HorizonSettings | null> {
  const { data, error } = await supabase
    .from('households')
    .update({ horizon_event_order: eventOrder.join(',') })
    .eq('id', householdId)
    .select('horizon_reporting_currency, horizon_event_order')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toHorizonSettings(data) : null;
}
