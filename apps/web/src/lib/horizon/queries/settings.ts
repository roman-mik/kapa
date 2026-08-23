/**
 * Household-level horizon settings query — reporting currency and event order,
 * which live on the shared `households` row (see 0014_horizon_accounts.sql and
 * 0022_horizon_projection.sql).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonSettings, HorizonTaxSettings } from '../types';
import { toHorizonSettings, toHorizonTaxSettings } from '../mappers';

export async function getHorizonSettings(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<HorizonSettings> {
  const { data, error } = await supabase
    .from('households')
    .select('horizon_reporting_currency, horizon_event_order')
    .eq('id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return {
      reportingCurrency: 'RSD',
      eventOrder: [
        'income',
        'oneOffIn',
        'obligation',
        'dailyExpense',
        'oneOffOut',
      ],
    };
  }
  return toHorizonSettings(data);
}

/** F1/F3's tax policy — see 0024_horizon_tax_settings.sql. */
export async function getHorizonTaxSettings(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<HorizonTaxSettings> {
  const { data, error } = await supabase
    .from('households')
    .select('horizon_tax_fixed_monthly_minor, horizon_tax_marginal_rate_bps')
    .eq('id', householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { fixedMonthlyMinor: null, marginalRateBps: null };
  return toHorizonTaxSettings(data);
}
