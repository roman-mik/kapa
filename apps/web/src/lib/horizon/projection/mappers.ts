/**
 * Mappers for projection dismissals.
 */
import type { Currency, Money } from '@/lib/types';
import type { ProjectionDismissal } from './types';
import type { Database } from '@/lib/supabase/database.types';

type Tables = Database['public']['Tables'];
type Row<T extends keyof Tables> = Tables[T]['Row'];

export type ProjectionDismissalRow = Row<'horizon_projection_dismissals'>;

export function toProjectionDismissal(
  row: ProjectionDismissalRow
): ProjectionDismissal {
  return {
    id: row.id,
    negativeDate: row.negative_date,
    shortfallMinor: row.shortfall_minor as Money,
    currency: row.currency as Currency,
    reason: row.reason,
    createdAt: row.created_at,
  };
}
