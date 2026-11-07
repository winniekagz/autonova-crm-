import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { AuthenticatedUser } from './authenticated-user.js';

/** Roles whose holders must complete a second factor before their session is fully usable. */
export const ROLES_REQUIRING_MFA: readonly string[] = [SystemRoleKey.Director];

export interface SessionContextRecord {
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    mfaVerifiedAt: Date | null;
  };
  user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
    roles: { key: string; permissions: string[] }[];
  };
}

export type AuthenticationFailure =
  | 'session_not_found'
  | 'subject_mismatch'
  | 'session_revoked'
  | 'session_expired'
  | 'user_inactive';

export type AuthenticationResult =
  { ok: true; user: AuthenticatedUser } | { ok: false; reason: AuthenticationFailure };

/**
 * The per-request rule (docs/06 "Access-token validation"). A valid signature is necessary but never
 * sufficient: the session must be live, belong to the token's subject, and the user must be ACTIVE.
 * Roles and permissions come from `record` (the database), never from the token.
 */
export function authenticateSession(
  record: SessionContextRecord | null,
  claims: { sub: string; sid: string },
  now: Date,
): AuthenticationResult {
  if (!record || record.session.id !== claims.sid)
    return { ok: false, reason: 'session_not_found' };
  if (record.session.userId !== claims.sub || record.user.id !== claims.sub) {
    return { ok: false, reason: 'subject_mismatch' };
  }
  if (record.session.revokedAt) return { ok: false, reason: 'session_revoked' };
  if (record.session.expiresAt <= now) return { ok: false, reason: 'session_expired' };
  if (record.user.status !== UserStatus.Active) return { ok: false, reason: 'user_inactive' };

  const roles = record.user.roles.map((r) => r.key);
  const permissions = [...new Set(record.user.roles.flatMap((r) => r.permissions))].sort();
  return {
    ok: true,
    user: {
      id: record.user.id,
      email: record.user.email,
      fullName: record.user.fullName,
      sessionId: record.session.id,
      roles,
      permissions,
      mfaVerified: record.session.mfaVerifiedAt !== null,
      mfaRequired: roles.some((role) => ROLES_REQUIRING_MFA.includes(role)),
    },
  };
}

/** A session that still owes a second factor may only reach routes marked as allowing it. */
export function isRestricted(
  user: Pick<AuthenticatedUser, 'mfaRequired' | 'mfaVerified'>,
): boolean {
  return user.mfaRequired && !user.mfaVerified;
}
