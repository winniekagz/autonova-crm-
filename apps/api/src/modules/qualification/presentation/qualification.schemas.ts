import { QualificationRating, enumValues } from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

const rating = z.enum(enumValues(QualificationRating));
const optionalText = (max: number) => z.string().trim().max(max).optional();

/** The four ratings only. There is deliberately no `score` field: a client cannot choose its own score. */
export const assessSchema = z
  .object({
    budget: rating,
    authority: rating,
    need: rating,
    timeline: rating,
    notes: optionalText(2000),
  })
  .strict();

export const qualifySchema = z
  .object({
    fromStage: z.literal('VISITS_AND_CALLS'),
    overrideReason: optionalText(500),
    note: optionalText(1000),
  })
  .strict();

export const bantSettingsSchema = z
  .object({
    passMark: z.number().int(),
    weights: z
      .object({
        budget: z.number().int(),
        authority: z.number().int(),
        need: z.number().int(),
        timeline: z.number().int(),
      })
      .strict(),
  })
  .strict();

export const listQuerySchema = paginationQuerySchema;
export const leadIdSchema = uuidSchema;

export type AssessBody = z.infer<typeof assessSchema>;
export type QualifyBody = z.infer<typeof qualifySchema>;
export type BantSettingsBody = z.infer<typeof bantSettingsSchema>;
