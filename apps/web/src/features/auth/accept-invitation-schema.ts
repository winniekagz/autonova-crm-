import { passwordSchema } from '@autonova/validation';
import { z } from 'zod';

/**
 * Choosing a first password: the shared password policy, plus a matching confirmation. The policy
 * lives in `@autonova/validation` and is enforced again by the API; this is only the early,
 * friendly check.
 */
export const acceptInvitationSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match.',
    path: ['confirmPassword'],
  });

export type AcceptInvitationValues = z.input<typeof acceptInvitationSchema>;
