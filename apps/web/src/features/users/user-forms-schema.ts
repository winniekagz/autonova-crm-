import { fullNameSchema } from '@autonova/validation';
import { z } from 'zod';

export const renameUserSchema = z.object({ fullName: fullNameSchema });
export type RenameUserValues = z.input<typeof renameUserSchema>;

export const changeRolesSchema = z.object({
  roles: z.array(z.string()).min(1, 'Select at least one role.'),
});
export type ChangeRolesValues = z.input<typeof changeRolesSchema>;

/** Same role set, whatever the order the boxes were ticked in. */
export function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join(',') === [...b].sort().join(',');
}
