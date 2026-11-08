import type { Prisma } from '../../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';

/**
 * Who can see which company (decision: docs/06, S1): Directors see all. Everyone else sees only the
 * companies they created, or that have at least one lead they own. Contacts and leads inherit the
 * company's visibility, except that a person's leads stay limited to the leads they own.
 */
export function companyVisibility(user: AuthenticatedUser): Prisma.CompanyWhereInput {
  if (user.roles.includes('director')) return {};
  return {
    OR: [{ createdByUserId: user.id }, { leads: { some: { ownerUserId: user.id } } }],
  };
}

export const isDirector = (user: AuthenticatedUser) => user.roles.includes('director');

/** Lead scope inside a company page: Directors see every lead, others only their own. */
export const leadOwnerScope = (user: AuthenticatedUser) =>
  isDirector(user) ? {} : { ownerUserId: user.id };
