import { describe, expect, it } from 'vitest';
import { parseLoginResponse, parseMeResponse } from './api';

const me = {
  id: 'u1',
  email: 'a@b.co',
  fullName: 'A B',
  roles: ['director'],
  permissions: [],
  mfa: { required: true, verified: false },
  restricted: true,
};

describe('parseLoginResponse', () => {
  it('accepts the contract shape', () => {
    const body = { accessToken: 'a.b.c', tokenType: 'Bearer', expiresIn: 900, mfaRequired: false };
    expect(parseLoginResponse(body)).toEqual(body);
  });

  it.each([
    ['null', null],
    ['missing token', { tokenType: 'Bearer', expiresIn: 1, mfaRequired: false }],
    [
      'wrong token type',
      { accessToken: 'x', tokenType: 'Basic', expiresIn: 1, mfaRequired: false },
    ],
    [
      'string expiry',
      { accessToken: 'x', tokenType: 'Bearer', expiresIn: '1', mfaRequired: false },
    ],
  ])('rejects %s instead of passing undefined into components', (_name, body) => {
    expect(() => parseLoginResponse(body)).toThrow(/Unexpected login response/);
  });
});

describe('parseMeResponse', () => {
  it('accepts the contract shape', () => {
    expect(parseMeResponse(me)).toEqual(me);
  });

  it('drops unknown fields rather than trusting them', () => {
    expect(parseMeResponse({ ...me, passwordHash: 'x' })).not.toHaveProperty('passwordHash');
  });

  it('rejects a malformed profile', () => {
    expect(() => parseMeResponse({ ...me, roles: 'director' })).toThrow(/Unexpected profile/);
    expect(() => parseMeResponse({ ...me, mfa: undefined })).toThrow(/Unexpected profile/);
  });
});
