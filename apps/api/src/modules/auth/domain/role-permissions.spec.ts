import { PermissionKey, SystemRoleKey, enumValues } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import { PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS } from './role-permissions.js';

describe('ROLE_PERMISSIONS', () => {
  it('defines every system role and only valid permission keys', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(enumValues(SystemRoleKey).sort());
    const valid = new Set<string>(enumValues(PermissionKey));
    for (const keys of Object.values(ROLE_PERMISSIONS)) {
      for (const key of keys) expect(valid.has(key)).toBe(true);
    }
  });

  it('grants user administration to Directors only (PRD §2.3: Manage users and settings)', () => {
    for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
      const userAdmin = keys.filter((k) => k.startsWith('users:') || k.startsWith('roles:'));
      if (role === SystemRoleKey.Director) expect(userAdmin.length).toBeGreaterThan(0);
      else expect(userAdmin).toEqual([]);
    }
  });

  it('grants Business Development own leads, company create/edit (not archive) and visit reports', () => {
    expect(ROLE_PERMISSIONS[SystemRoleKey.BusinessDevelopment]).toEqual([
      PermissionKey.LeadsList,
      PermissionKey.LeadsRead,
      PermissionKey.LeadsCreate,
      PermissionKey.LeadsUpdate,
      PermissionKey.CompaniesList,
      PermissionKey.CompaniesRead,
      PermissionKey.CompaniesCreate,
      PermissionKey.CompaniesUpdate,
      PermissionKey.ActivitiesList,
      PermissionKey.ActivitiesRead,
      PermissionKey.ActivitiesCreate,
      PermissionKey.ActivitiesUpdate,
      PermissionKey.CatalogueRead,
      PermissionKey.TorsRead,
      PermissionKey.TorsWrite,
      PermissionKey.QuotationsRead,
      PermissionKey.QuotationsWrite,
      PermissionKey.ClientsRead,
    ]);
    expect(ROLE_PERMISSIONS[SystemRoleKey.Director]).toContain(PermissionKey.CompaniesArchive);
    expect(ROLE_PERMISSIONS[SystemRoleKey.TechnicalLead]).toEqual([]);
    expect(ROLE_PERMISSIONS[SystemRoleKey.Finance]).toEqual([]);
  });

  it('keeps override, discount approval, settings and catalogue management Director-only', () => {
    const bd = ROLE_PERMISSIONS[SystemRoleKey.BusinessDevelopment];
    for (const key of [
      PermissionKey.QualificationOverride,
      PermissionKey.TorsApprove,
      PermissionKey.SettingsManage,
      PermissionKey.CatalogueManage,
    ]) {
      expect(bd).not.toContain(key);
      expect(ROLE_PERMISSIONS[SystemRoleKey.Director]).toContain(key);
    }
  });

  it('grants every defined permission to at least one role, so none is dead', () => {
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const key of enumValues(PermissionKey)) expect(granted.has(key)).toBe(true);
  });

  it('has no wildcard permissions and a description for every key', () => {
    for (const key of enumValues(PermissionKey)) {
      expect(key).not.toContain('*');
      expect(PERMISSION_DESCRIPTIONS[key].length).toBeGreaterThan(0);
    }
  });
});
