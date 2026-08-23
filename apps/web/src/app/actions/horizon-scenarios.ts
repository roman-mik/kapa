'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getHouseholdId, verifySession } from '@/lib/auth/dal';
import { createClient } from '@/lib/supabase/server';
import {
  scenarioCreateFromDraftSchema,
  scenarioCreateSchema,
  scenarioDiffUpsertSchema,
  scenarioOneOffCreateSchema,
  scenarioUpdateSchema,
} from '@/lib/horizon/scenarios/validation';
import {
  createScenario,
  createScenarioOneOff,
  deleteScenario,
  deleteScenarioDiff,
  deleteScenarioOneOff,
  duplicateScenario,
  updateScenario,
  upsertScenarioDiff,
} from '@/lib/horizon/mutations/scenarios';
import { reportError } from '@/lib/observability';
import type { ActionResult } from './expenses';

function revalidateScenarios() {
  revalidatePath('/horizon/scenarios');
  revalidatePath('/horizon/timeline');
}

export async function createScenarioAction(input: unknown): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = scenarioCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createScenario(supabase, householdId, parsed.data);
  } catch (error) {
    reportError('createScenarioAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

/** E1's "save as scenario" bridge: creates a scenario and writes every draft
 *  diff onto it in one round trip, so the client never has to plumb a
 *  freshly created id back through further calls. */
export async function createScenarioFromDraftAction(
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = scenarioCreateFromDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    const scenario = await createScenario(supabase, householdId, {
      name: parsed.data.name,
    });
    for (const diff of parsed.data.diffs) {
      await upsertScenarioDiff(supabase, householdId, scenario.id, diff);
    }
  } catch (error) {
    reportError('createScenarioFromDraftAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function renameScenarioAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = scenarioUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await updateScenario(supabase, householdId, id, parsed.data);
  } catch (error) {
    reportError('renameScenarioAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function duplicateScenarioAction(
  id: string,
  newName: string
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };
  if (!newName.trim()) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await duplicateScenario(supabase, householdId, id, newName);
  } catch (error) {
    reportError('duplicateScenarioAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function deleteScenarioAction(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await deleteScenario(supabase, householdId, id);
  } catch (error) {
    reportError('deleteScenarioAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function saveScenarioDiffAction(
  scenarioId: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = scenarioDiffUpsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await upsertScenarioDiff(supabase, householdId, scenarioId, parsed.data);
  } catch (error) {
    reportError('saveScenarioDiffAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function deleteScenarioDiffAction(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await deleteScenarioDiff(supabase, householdId, id);
  } catch (error) {
    reportError('deleteScenarioDiffAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function saveScenarioOneOffAction(
  scenarioId: string,
  input: unknown
): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  const parsed = scenarioOneOffCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t('saveFailed') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await createScenarioOneOff(supabase, householdId, scenarioId, parsed.data);
  } catch (error) {
    reportError('saveScenarioOneOffAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}

export async function deleteScenarioOneOffAction(id: string): Promise<ActionResult> {
  const t = await getTranslations('Errors');
  const user = await verifySession();
  if (!user) return { ok: false, error: t('notSignedIn') };

  try {
    const householdId = await getHouseholdId(user.id);
    if (!householdId) throw new Error('No household for user');
    const supabase = await createClient();
    await deleteScenarioOneOff(supabase, householdId, id);
  } catch (error) {
    reportError('deleteScenarioOneOffAction', error);
    return { ok: false, error: t('saveFailed') };
  }

  revalidateScenarios();
  return { ok: true };
}
