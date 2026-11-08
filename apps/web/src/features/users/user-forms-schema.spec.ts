import { describe, expect, it } from 'vitest';
import { changeRolesSchema, renameUserSchema, sameRoles } from './user-forms-schema';

describe('renameUserSchema', () => {
  it('trims the name', () => {
    expect(renameUserSchema.parse({ fullName: '  Wanjiru K.  ' })).toEqual({
      fullName: 'Wanjiru K.',
    });
  });

  it('asks for a name when it is empty or only spaces', () => {
    for (const fullName of ['', '   ']) {
      const result = renameUserSchema.safeParse({ fullName });
      expect(result.error?.issues[0]?.message).toBe('Enter a name');
    }
  });
});

describe('changeRolesSchema', () => {
  it('needs at least one role', () => {
    expect(changeRolesSchema.safeParse({ roles: [] }).error?.issues[0]?.message).toBe(
      'Select at least one role.',
    );
    expect(changeRolesSchema.safeParse({ roles: ['finance'] }).success).toBe(true);
  });
});

describe('sameRoles', () => {
  it('ignores order and compares the sets', () => {
    expect(sameRoles(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(sameRoles(['a'], ['a', 'b'])).toBe(false);
    expect(sameRoles([], [])).toBe(true);
    expect(sameRoles(['a'], ['b'])).toBe(false);
  });

  it('does not reorder the arrays it was given', () => {
    const roles = ['b', 'a'];
    sameRoles(roles, ['a', 'b']);
    expect(roles).toEqual(['b', 'a']);
  });
});
