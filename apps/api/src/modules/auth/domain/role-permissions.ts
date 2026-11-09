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
    PermissionKey.ActivitiesList,
    PermissionKey.ActivitiesRead,
    PermissionKey.ActivitiesCreate,
    PermissionKey.ActivitiesUpdate,
    PermissionKey.ActivitiesArchive,
    PermissionKey.ActivitiesRetention,
    PermissionKey.QualificationOverride,
    PermissionKey.SettingsManage,
    PermissionKey.CatalogueRead,
    PermissionKey.CatalogueManage,
    PermissionKey.TorsRead,
    PermissionKey.TorsWrite,
    PermissionKey.TorsApprove,
    PermissionKey.QuotationsRead,
    PermissionKey.QuotationsWrite,
    PermissionKey.ClientsRead,
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
    // PRD §2.2/§2.3: BD creates and edits visit reports on their own leads. Archiving is a Director power
    // (decision 2026-11-08): the PRD gives "delete records" to Directors only.
    PermissionKey.ActivitiesList,
    PermissionKey.ActivitiesRead,
    PermissionKey.ActivitiesCreate,
    PermissionKey.ActivitiesUpdate,
    // PRD 4.5/4.6: BD drafts and sends ToRs and quotations on their own leads. Discount approval and the
    // qualification override stay with Directors.
    PermissionKey.CatalogueRead,
    PermissionKey.TorsRead,
    PermissionKey.TorsWrite,
    PermissionKey.QuotationsRead,
    PermissionKey.QuotationsWrite,
    PermissionKey.ClientsRead,
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
  [PermissionKey.QualificationOverride]:
    'Qualify a lead whose BANT assessment did not pass, with a recorded reason',
  [PermissionKey.SettingsManage]:
    'Change system settings such as the BANT pass mark and discount threshold',
  [PermissionKey.CatalogueRead]: 'View the reusable scope catalogue',
  [PermissionKey.CatalogueManage]: 'Create and edit catalogue items',
  [PermissionKey.TorsRead]: 'View Terms of Reference on visible leads',
  [PermissionKey.TorsWrite]: 'Draft, version, send and record signatures on Terms of Reference',
  [PermissionKey.TorsApprove]: 'Approve a discount above the threshold before a ToR is sent',
  [PermissionKey.QuotationsRead]: 'View quotations on visible leads',
  [PermissionKey.QuotationsWrite]: 'Create quotations and move them through their statuses',
  [PermissionKey.ClientsRead]: 'View client accounts created from signed agreements',
  [PermissionKey.ActivitiesList]: 'List the visit and call reports of a lead in the caller’s scope',
  [PermissionKey.ActivitiesRead]:
    'View a report and download its attachments in the caller’s scope',
  [PermissionKey.ActivitiesCreate]:
    'Record a report and upload attachments on a lead in the caller’s scope',
  [PermissionKey.ActivitiesUpdate]:
    'Edit a report the caller created (Directors: any) and add attachments',
  [PermissionKey.ActivitiesArchive]:
    'Archive or restore a report, and remove an attachment, giving a reason (Director only)',
  [PermissionKey.ActivitiesRetention]:
    'Place or lift a legal hold on a report, and review or approve retention purges (Director only)',
};
