import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';

/** Directors see every lead; everyone else only the leads they own. `undefined` means unrestricted. */
export const scopeFor = (user: AuthenticatedUser) =>
  user.roles.includes('director') ? undefined : user.id;
