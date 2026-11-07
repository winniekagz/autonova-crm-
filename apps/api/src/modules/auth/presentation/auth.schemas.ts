import { emailSchema } from '@autonova/validation';
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
