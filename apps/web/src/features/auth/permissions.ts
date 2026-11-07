import type { PermissionKey } from '@autonova/enums';
import type { MeResponse } from '@autonova/contracts';

/**
 * UX-only: decides what to SHOW. The API enforces every permission independently, so a wrong
 * answer here can only produce a button that returns 403, never an unauthorised action.
 * A session that still owes MFA is treated as having no permissions, matching the server.
 */
export function can(me: MeResponse | null, permission: PermissionKey): boolean {
  return me !== null && !me.restricted && me.permissions.includes(permission);
}
