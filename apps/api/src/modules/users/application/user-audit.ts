import type { UserDto } from '@autonova/contracts';
import { snapshot, type AuditSnapshot } from '../../audit/audit.service.js';

/**
 * What an audit row may say about a user. Allow-listed: the DTO has no credential fields, but
 * the allow-list keeps it that way if one is ever added. Roles are stored as a sorted, comma-joined string
 * because audit snapshots hold primitives only.
 */
export function userAuditSnapshot(user: UserDto): AuditSnapshot {
  return {
    ...snapshot(user, ['email', 'fullName', 'status']),
    roles: user.roles.join(','),
  };
}
