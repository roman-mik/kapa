'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { dismissNegativeDaySchema } from '@/lib/horizon/projection/validation';
import {
  dismissNegativeDay,
  undismissNegativeDay,
} from '@/lib/horizon/mutations/projection';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/** Server Action: dismiss a projected negative day, recording a reason. */
export async function dismissNegativeDayAction(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = dismissNegativeDaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkDismissalFields') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    await dismissNegativeDay(supabase, householdId, parsed.data, today);
  } catch (error) {
    reportError('dismissNegativeDayAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/timeline');
  return { ok: true };
}

/** Server Action: undo a negative-day dismissal. */
export async function undismissNegativeDayAction(
  negativeDate: string
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await undismissNegativeDay(supabase, householdId, negativeDate);
  } catch (error) {
    reportError('undismissNegativeDayAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/timeline');
  return { ok: true };
}
