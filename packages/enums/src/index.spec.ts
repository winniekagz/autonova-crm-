import { describe, expect, it } from 'vitest';
import { Currency, PermissionKey, SystemRoleKey, UserStatus, enumValues } from './index.js';

describe('enums', () => {
  it('exposes the four system roles from the PRD', () => {
    expect(enumValues(SystemRoleKey).sort()).toEqual([
      'business_development',
      'director',
      'finance',
      'technical_lead',
    ]);
  });

  it('supports exactly KES and USD', () => {
    expect(enumValues(Currency)).toEqual(['KES', 'USD']);
  });

  it('enumValues returns values, not keys', () => {
    expect(enumValues(UserStatus)).toEqual(['INVITED', 'ACTIVE', 'DISABLED']);
  });

  it('permission keys follow <resource>:<action> (matches the database CHECK)', () => {
    for (const key of enumValues(PermissionKey)) {
      expect(key).toMatch(/^[a-z][a-z_]*:[a-z][a-z_]*$/);
    }
  });
});
