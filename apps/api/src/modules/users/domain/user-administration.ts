import { SystemRoleKey, UserStatus } from '@autonova/enums';

/** Business-rule violations. The application layer maps `code` to an HTTP 422 response. */
export type AdministrationViolation =
  | 'SELF_ROLE_CHANGE_FORBIDDEN'
  | 'SELF_DISABLE_FORBIDDEN'
  | 'LAST_DIRECTOR'
  | 'NO_ROLES'
  | 'USER_ALREADY_DISABLED';

export const VIOLATION_MESSAGES: Record<AdministrationViolation, string> = {
  SELF_ROLE_CHANGE_FORBIDDEN: 'You cannot change your own roles. Ask another Director to do it.',
  SELF_DISABLE_FORBIDDEN: 'You cannot disable your own account. Ask another Director to do it.',
  LAST_DIRECTOR:
    'This would leave the system without an active Director. Make another user an active Director first.',
  NO_ROLES: 'A user must hold at least one role.',
  USER_ALREADY_DISABLED: 'This user is already disabled.',
};

export type RuleResult = { ok: true } | { ok: false; violation: AdministrationViolation };
const OK: RuleResult = { ok: true };
const refuse = (violation: AdministrationViolation): RuleResult => ({ ok: false, violation });

export interface TargetState {
  id: string;
  status: string;
  roles: readonly string[];
}

/** Sorted, de-duplicated role keys: the canonical form used for comparison and audit. */
export function normalizeRoles(roles: readonly string[]): string[] {
  return [...new Set(roles)].sort();
}

/** An "active Director" is the only kind that can actually sign in and administer the system. */
export function isActiveDirector(user: Pick<TargetState, 'status' | 'roles'>): boolean {
  return user.status === UserStatus.Active && user.roles.includes(SystemRoleKey.Director);
}

/**
 * May the actor change the target's roles to `nextRoles`?
 *
 * Policy decisions (docs/06, docs/flows/user-management.md):
 *  - Nobody changes their OWN roles, upwards or downwards. Privilege changes need a second
 *    Director, so no one can escalate themselves and a single Director cannot demote themselves
 *    into an unrecoverable state.
 *  - Never leave zero active Directors.
 *
 * `otherActiveDirectors` counts active Directors EXCLUDING the target, read under the
 * director-set lock so concurrent changes cannot both pass.
 */
export function checkRoleChange(input: {
  actorId: string;
  target: TargetState;
  nextRoles: readonly string[];
  otherActiveDirectors: number;
}): RuleResult {
  if (input.actorId === input.target.id) return refuse('SELF_ROLE_CHANGE_FORBIDDEN');
  if (input.nextRoles.length === 0) return refuse('NO_ROLES');

  const losesDirector =
    isActiveDirector(input.target) && !input.nextRoles.includes(SystemRoleKey.Director);
  if (losesDirector && input.otherActiveDirectors === 0) return refuse('LAST_DIRECTOR');
  return OK;
}

/**
 * May the actor disable the target?
 *
 * INVITED → DISABLED is allowed (cancelling an invitation): users are never deleted, so without it
 * a mistakenly invited address could never be withdrawn. DISABLED → DISABLED is refused.
 * Re-enabling is NOT implemented: it requires a fresh password reset (docs/06), which does not exist yet.
 */
export function checkDisable(input: {
  actorId: string;
  target: TargetState;
  otherActiveDirectors: number;
}): RuleResult {
  if (input.actorId === input.target.id) return refuse('SELF_DISABLE_FORBIDDEN');
  if (input.target.status === UserStatus.Disabled) return refuse('USER_ALREADY_DISABLED');
  if (isActiveDirector(input.target) && input.otherActiveDirectors === 0) {
    return refuse('LAST_DIRECTOR');
  }
  return OK;
}
