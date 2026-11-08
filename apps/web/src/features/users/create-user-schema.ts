import { emailSchema, fullNameSchema } from '@autonova/validation';
import { z } from 'zod';

/**
 * Inviting a user: the shared name and email rules plus at least one role. The API validates all of
 * this again; this is the early, friendly check that keeps obviously wrong input off the network.
 */
export const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  roles: z.array(z.string()).min(1, 'Select at least one role.'),
});

export type CreateUserValues = z.input<typeof createUserSchema>;

/** Field names the API may report problems for; anything else it sends is ignored. */
export const CREATE_USER_FIELDS = ['fullName', 'email', 'roles'] as const;
