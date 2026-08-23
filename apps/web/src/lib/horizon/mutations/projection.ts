/**
 * Projection dismissals mutations.
 */
import type { SupabaseServerClient } from '@/lib/supabase/types';
import type { ProjectionDismissal } from '../projection/types';
import { toProjectionDismissal } from '../projection/mappers';
import type { z } from 'zod';
import type { dismissNegativeDaySchema } from '../projection/validation';

export async function dismissNegativeDay(
  supabase: SupabaseServerClient,
  householdId: string,
  input: z.infer<typeof dismissNegativeDaySchema>,
  today: string
): Promise<ProjectionDismissal | null> {
  // Upsert: replace if exists, insert if new
  const { data, error } = await supabase
    .from('horizon_projection_dismissals')
    .upsert(
      {
        household_id: householdId,
        negative_date: input.negativeDate,
        shortfall_minor: input.shortfallMinor,
        currency: input.currency,
        reason: input.reason,
      },
      { onConflict: 'household_id,negative_date' }
    )
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Clean up old dismissals (older than today)
  await supabase
    .from('horizon_projection_dismissals')
    .delete()
    .eq('household_id', householdId)
    .lt('negative_date', today);

  return data ? toProjectionDismissal(data) : null;
}

export async function undismissNegativeDay(
  supabase: SupabaseServerClient,
  householdId: string,
  negativeDate: string
): Promise<boolean> {
  const { error } = await supabase
    .from('horizon_projection_dismissals')
    .delete()
    .eq('household_id', householdId)
    .eq('negative_date', negativeDate);

  if (error) throw new Error(error.message);
  return true;
}
