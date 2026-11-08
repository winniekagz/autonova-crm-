import { PermissionKey, SystemRoleKey } from '@autonova/enums';

/**
 * Approved role → permission mapping (docs/06 "Permission matrix"). Only rows marked "clear" are
 * granted; every "Confirm" row stays ungranted until stakeholders approve it (decision S1).
 *
 * This file is the single source of truth. `prisma/seed.ts` writes it to the database, and the
 * guard reads the database — never this file — so a role change in the database is what counts.
 */
export const ROLE_PERMISSIONS: Record<SystemRoleKey, readonly PermissionKey[]> = {
  // "Manage users and settings: Director only" (PRD §2.3).
  [SystemRoleKey.Director]: [
    PermissionKey.UsersList,
    PermissionKey.UsersRead,
    PermissionKey.UsersCreate,
    PermissionKey.UsersUpdate,
    PermissionKey.UsersAssignRoles,
    PermissionKey.UsersDisable,
    PermissionKey.RolesList,
    PermissionKey.LeadsList,
    PermissionKey.LeadsRead,
    PermissionKey.LeadsCreate,
    PermissionKey.LeadsUpdate,
  ],
  // PRD §2.2–2.3 and §4.1 explicitly grant BD users own leads and own pipeline.
  [SystemRoleKey.BusinessDevelopment]: [
    PermissionKey.LeadsList,
    PermissionKey.LeadsRead,
    PermissionKey.LeadsCreate,
    PermissionKey.LeadsUpdate,
  ],
  [SystemRoleKey.TechnicalLead]: [],
  [SystemRoleKey.Finance]: [],
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PermissionKey.UsersList]: 'List and search internal users',
  [PermissionKey.UsersRead]: 'View an internal user',
  [PermissionKey.UsersCreate]: 'Invite a new internal user',
  [PermissionKey.UsersUpdate]: 'Edit an internal user’s profile',
  [PermissionKey.UsersAssignRoles]: 'Change which roles an internal user holds',
  [PermissionKey.UsersDisable]: 'Disable an internal user and revoke their sessions',
  [PermissionKey.RolesList]: 'List the roles that can be assigned',
  [PermissionKey.LeadsList]: 'List leads in the caller’s permitted pipeline scope',
  [PermissionKey.LeadsRead]: 'View a lead in the caller’s permitted pipeline scope',
  [PermissionKey.LeadsCreate]: 'Create a lead owned by the caller',
  [PermissionKey.LeadsUpdate]: 'Update a lead in the caller’s permitted pipeline scope',
};
