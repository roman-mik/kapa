/**
 * Horizon projection Zod schemas for dismissals and event order.
 */
import { z } from 'zod';
import { CURRENCIES } from '@/lib/types';
import { EVENT_KINDS } from './types';

export const dismissNegativeDaySchema = z.object({
  negativeDate: z.string().date(),
  shortfallMinor: z.number().int().positive(),
  currency: z.enum(CURRENCIES),
  reason: z.string().trim().min(1).max(500),
});

export const eventOrderUpdateSchema = z
  .object({
    eventOrder: z.array(z.enum(EVENT_KINDS)),
  })
  .refine(
    (v) => v.eventOrder.length === 5,
    'Event order must contain exactly 5 kinds'
  )
  .refine(
    (v) => new Set(v.eventOrder).size === 5,
    'Event order must not contain duplicates'
  )
  .refine(
    (v) => EVENT_KINDS.every((kind) => v.eventOrder.includes(kind)),
    'Event order must contain all event kinds'
  );
