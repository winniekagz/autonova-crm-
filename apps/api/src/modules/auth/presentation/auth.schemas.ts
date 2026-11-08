import { emailSchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

/**
 * Deliberately NOT `passwordSchema`: login must not enforce or reveal the password policy, and
 * must accept any password that was valid when it was set.
 */
export const loginBodySchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;

export const sessionIdParamSchema = uuidSchema;

export const mfaCodeBodySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export type MfaCodeBody = z.infer<typeof mfaCodeBodySchema>;

export const mfaRecoveryBodySchema = z
  .object({ code: z.string().regex(/^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{4}(?:-[A-Fa-f0-9]{4}){7})$/) })
  .strict();
