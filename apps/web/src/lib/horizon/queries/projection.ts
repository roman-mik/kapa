/**
 * Projection dismissals query.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { ProjectionDismissal } from '../projection/types';
import { toProjectionDismissal } from '../projection/mappers';

export async function getProjectionDismissals(
  supabase: SupabaseServerClient,
  householdId: string
): Promise<ProjectionDismissal[]> {
  const { data, error } = await supabase
    .from('horizon_projection_dismissals')
    .select('*')
    .eq('household_id', householdId);

  if (error) throw new Error(error.message);
  return (data || []).map(toProjectionDismissal);
}
