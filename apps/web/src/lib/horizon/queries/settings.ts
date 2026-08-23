/**
 * Household-level horizon settings query — reporting currency and event order,
 * which live on the shared `households` row (see 0014_horizon_accounts.sql and
 * 0022_horizon_projection.sql).
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { HorizonSettings } from '../types';
import { toHorizonSettings } from '../mappers';

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
