import { describe, expect, it } from 'vitest';
import { can } from './permissions';
import { DIRECTOR } from '@/test/render';

describe('can (UX-only permission check)', () => {
  it('is true only for a held permission', () => {
    expect(can(DIRECTOR, 'users:create')).toBe(true);
    expect(can({ ...DIRECTOR, permissions: [] }, 'users:create')).toBe(false);
  });

  it('is false when signed out', () => {
    expect(can(null, 'users:list')).toBe(false);
  });

  it('treats an MFA-restricted session as having no permissions, like the server does', () => {
    expect(can({ ...DIRECTOR, restricted: true }, 'users:list')).toBe(false);
  });
});
