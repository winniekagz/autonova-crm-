import { SystemRoleKey, UserStatus, enumValues } from '@autonova/enums';
import {
  emailSchema,
  fullNameSchema,
  paginationQuerySchema,
  passwordSchema,
  reasonSchema,
  uuidSchema,
} from '@autonova/validation';
import { z } from 'zod';

/**
 * Role keys are validated against the closed set of system roles at the boundary. The use case
 * additionally resolves each key against the database, so an unknown key can never reach an INSERT.
 */
const roleKeySchema = z.enum(enumValues(SystemRoleKey));
const rolesSchema = z
  .array(roleKeySchema)
  .min(1, 'Select at least one role')
  .max(enumValues(SystemRoleKey).length);

// `.strict()` everywhere: unknown keys (e.g. `status`, `passwordHash`, `permissions`) are a 400,
// never silently ignored, so a client that thinks it can set them learns it cannot.
export const createUserBodySchema = z
  .object({ email: emailSchema, fullName: fullNameSchema, roles: rolesSchema })
  .strict();
export type CreateUserBody = z.infer<typeof createUserBodySchema>;

export const updateUserBodySchema = z.object({ fullName: fullNameSchema }).strict();
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

export const changeRolesBodySchema = z
  .object({ roles: rolesSchema, reason: reasonSchema.optional() })
  .strict();
export type ChangeRolesBody = z.infer<typeof changeRolesBodySchema>;

export const disableUserBodySchema = z.object({ reason: reasonSchema.optional() }).strict();
export type DisableUserBody = z.infer<typeof disableUserBodySchema>;

export const userIdParamSchema = uuidSchema;

export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    password: passwordSchema,
  })
  .strict();
export type AcceptInvitationBody = z.infer<typeof acceptInvitationSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(enumValues(UserStatus)).optional(),
  role: roleKeySchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
