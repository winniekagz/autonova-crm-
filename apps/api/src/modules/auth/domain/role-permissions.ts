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
    PermissionKey.CompaniesList,
    PermissionKey.CompaniesRead,
    PermissionKey.CompaniesCreate,
    PermissionKey.CompaniesUpdate,
    PermissionKey.CompaniesArchive,
  ],
  // PRD §2.2–2.3 and §4.1 explicitly grant BD users own leads and own pipeline.
  [SystemRoleKey.BusinessDevelopment]: [
    PermissionKey.LeadsList,
    PermissionKey.LeadsRead,
    PermissionKey.LeadsCreate,
    PermissionKey.LeadsUpdate,
    // PRD §4.2: BD creates and edits companies; visibility is limited to their own (docs/06).
    PermissionKey.CompaniesList,
    PermissionKey.CompaniesRead,
    PermissionKey.CompaniesCreate,
    PermissionKey.CompaniesUpdate,
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
  [PermissionKey.CompaniesList]: 'List companies in the caller’s permitted scope',
  [PermissionKey.CompaniesRead]:
    'View a company, its contacts and its leads in the caller’s permitted scope',
  [PermissionKey.CompaniesCreate]: 'Create a company and contacts at a company',
  [PermissionKey.CompaniesUpdate]:
    'Edit a company and its contacts in the caller’s permitted scope',
  [PermissionKey.CompaniesArchive]: 'Archive a company or contact',
};
