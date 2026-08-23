/**
 * Horizon scenario Zod schemas, same idiom as `@/lib/horizon/spending/validation`.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import { ONE_OFF_CATEGORIES, ONE_OFF_DIRECTIONS } from '@/lib/horizon/spending/types';
import { SCENARIO_DIFF_FIELDS } from './types';

const SCENARIO_ENTITY_TYPES = Object.keys(SCENARIO_DIFF_FIELDS) as [
  keyof typeof SCENARIO_DIFF_FIELDS,
  ...(keyof typeof SCENARIO_DIFF_FIELDS)[],
];

export const scenarioCreateSchema = z.object({
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().optional(),
});

export const scenarioUpdateSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes given.');

export const scenarioDiffUpsertSchema = z
  .object({
    entityType: z.enum(SCENARIO_ENTITY_TYPES),
    entityId: z.string().min(1),
    field: z.string().min(1).max(60),
    value: z.union([z.number(), z.boolean()]),
  })
  .refine(
    (v) => (SCENARIO_DIFF_FIELDS[v.entityType] as readonly string[]).includes(v.field),
    'Field is not editable for this entity type.'
  );

export const scenarioOneOffCreateSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).max(60),
  category: z.enum(ONE_OFF_CATEGORIES),
  amountMinor: z.number().int().positive(),
  currency: z.enum(CURRENCIES),
  date: z.string().min(1),
  direction: z.enum(ONE_OFF_DIRECTIONS),
});

export const scenarioCreateFromDraftSchema = z.object({
  name: z.string().min(1).max(60),
  diffs: z.array(scenarioDiffUpsertSchema),
});

export type ScenarioCreateInput = z.infer<typeof scenarioCreateSchema>;
export type ScenarioCreateFromDraftInput = z.infer<
  typeof scenarioCreateFromDraftSchema
>;
export type ScenarioUpdateInput = z.infer<typeof scenarioUpdateSchema>;
export type ScenarioDiffUpsertInput = z.infer<typeof scenarioDiffUpsertSchema>;
export type ScenarioOneOffCreateInput = z.infer<typeof scenarioOneOffCreateSchema>;
