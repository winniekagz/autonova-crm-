import { describe, expect, it } from 'vitest';
import { makeUser } from '@/test/render';
import { parseRoles, parseUser, parseUserPage } from './api';

describe('users API parsers', () => {
  it('accepts the contract shape and drops unknown fields', () => {
    const parsed = parseUser({ ...makeUser(), passwordHash: 'leak' });
    expect(parsed).toEqual(makeUser());
    expect(parsed).not.toHaveProperty('passwordHash');
  });

  it.each([
    ['unknown status', { ...makeUser(), status: 'SUSPENDED' }],
    ['roles not an array', { ...makeUser(), roles: 'finance' }],
    ['missing id', { ...makeUser(), id: undefined }],
    ['bad lastLoginAt', { ...makeUser(), lastLoginAt: 5 }],
  ])('rejects %s', (_name, body) => {
    expect(() => parseUser(body)).toThrow(/Unexpected user response/);
  });

  it('parses a page and rejects a malformed one', () => {
    const page = parseUserPage({ items: [makeUser()], page: 1, pageSize: 20, total: 1 });
    expect(page.items).toHaveLength(1);
    expect(() => parseUserPage({ items: 'x', page: 1, pageSize: 20, total: 1 })).toThrow();
  });

  it('parses roles', () => {
    expect(parseRoles([{ key: 'finance', name: 'Finance', description: null }])).toHaveLength(1);
    expect(() => parseRoles({})).toThrow();
    expect(() => parseRoles([{ key: 1 }])).toThrow();
  });
});
