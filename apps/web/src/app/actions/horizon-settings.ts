'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import { horizonSettingsUpdateSchema } from '@/lib/horizon/validation';
import { eventOrderUpdateSchema } from '@/lib/horizon/projection/validation';
import {
  updateHorizonReportingCurrency,
  setHorizonEventOrder,
} from '@/lib/horizon/mutations/settings';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

/** Set the household's horizon reporting currency. */
export async function setHorizonReportingCurrency(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = horizonSettingsUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('checkCurrency') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await updateHorizonReportingCurrency(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('setHorizonReportingCurrency', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon');
  return { ok: true };
}

/** Set the household's projection event order. */
export async function setEventOrder(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = eventOrderUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await setHorizonEventOrder(supabase, householdId, parsed.data.eventOrder);
  } catch (error) {
    reportError('setEventOrder', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidatePath('/horizon/assumptions');
  revalidatePath('/horizon/timeline');
  return { ok: true };
}
