/**
 * Zod schema for Epic F's tax-settings update, same idiom as
 * `@/lib/horizon/validation`.
 */
import { z } from 'zod';

export const horizonTaxSettingsUpdateSchema = z.object({
  fixedMonthlyMinor: z.number().int().nonnegative(),
  marginalRateBps: z.number().int().min(0).max(9999),
});

export type HorizonTaxSettingsUpdateInput = z.infer<
  typeof horizonTaxSettingsUpdateSchema
>;
