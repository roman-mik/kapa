'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { horizonTaxSettingsUpdateSchema } from '@/lib/horizon/target-rate/validation';
import { updateHorizonTaxSettings } from '@/lib/horizon/mutations/settings';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/** Set the household's tax policy for target-rate solving (F1/F3). */
export async function setHorizonTaxSettings(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = horizonTaxSettingsUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await updateHorizonTaxSettings(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('setHorizonTaxSettings', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/target-rate');
  return { ok: true };
}
