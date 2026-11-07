import { describe, expect, it } from 'vitest';
import {
  authenticateSession,
  isRestricted,
  type SessionContextRecord,
} from './session-authentication.js';

const NOW = new Date('2026-11-07T12:00:00Z');
const USER = '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60';
const SID = '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f61';
const claims = { sub: USER, sid: SID };

const record = (
  over: {
    session?: Partial<SessionContextRecord['session']>;
    user?: Partial<SessionContextRecord['user']>;
  } = {},
): SessionContextRecord => ({
  session: {
    id: SID,
    userId: USER,
    expiresAt: new Date('2026-12-01T00:00:00Z'),
    revokedAt: null,
    mfaVerifiedAt: null,
    ...over.session,
  },
  user: {
    id: USER,
    email: 'bd@autonova.test',
    fullName: 'BD User',
    status: 'ACTIVE',
    roles: [{ key: 'business_development', permissions: ['leads:read', 'leads:create'] }],
    ...over.user,
  },
});

describe('authenticateSession', () => {
  it('accepts a live session of an active user and resolves roles and permissions from the record', () => {
    const result = authenticateSession(record(), claims, NOW);
    expect(result).toMatchObject({
      ok: true,
      user: {
        id: USER,
        sessionId: SID,
        roles: ['business_development'],
        permissions: ['leads:create', 'leads:read'],
        mfaRequired: false,
      },
    });
  });

  it('rejects an unknown session', () => {
    expect(authenticateSession(null, claims, NOW)).toEqual({
      ok: false,
      reason: 'session_not_found',
    });
  });

  it('rejects a session whose id differs from the token', () => {
    const other = record({ session: { id: '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5fff' } });
    expect(authenticateSession(other, claims, NOW)).toEqual({
      ok: false,
      reason: 'session_not_found',
    });
  });

  it('rejects a session that belongs to a different user than the token subject', () => {
    const stolen = record({ session: { userId: '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5fee' } });
    expect(authenticateSession(stolen, claims, NOW)).toEqual({
      ok: false,
      reason: 'subject_mismatch',
    });
  });

  it('rejects a revoked session', () => {
    const revoked = record({ session: { revokedAt: new Date('2026-11-07T11:00:00Z') } });
    expect(authenticateSession(revoked, claims, NOW)).toEqual({
      ok: false,
      reason: 'session_revoked',
    });
  });

  it('rejects an expired session, including exactly at the expiry instant', () => {
    expect(
      authenticateSession(
        record({ session: { expiresAt: new Date('2026-11-07T11:59:59Z') } }),
        claims,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'session_expired' });
    expect(authenticateSession(record({ session: { expiresAt: NOW } }), claims, NOW)).toEqual({
      ok: false,
      reason: 'session_expired',
    });
  });

  it.each(['INVITED', 'DISABLED'])(
    'rejects a %s user even though the session is live',
    (status) => {
      expect(authenticateSession(record({ user: { status } }), claims, NOW)).toEqual({
        ok: false,
        reason: 'user_inactive',
      });
    },
  );

  it('flags Directors as requiring MFA and restricts them until verified', () => {
    const director = record({ user: { roles: [{ key: 'director', permissions: [] }] } });
    const unverified = authenticateSession(director, claims, NOW);
    expect(unverified.ok && unverified.user.mfaRequired).toBe(true);
    expect(unverified.ok && isRestricted(unverified.user)).toBe(true);

    const verified = authenticateSession(
      record({
        user: { roles: [{ key: 'director', permissions: [] }] },
        session: { mfaVerifiedAt: new Date('2026-11-07T11:30:00Z') },
      }),
      claims,
      NOW,
    );
    expect(verified.ok && isRestricted(verified.user)).toBe(false);
  });

  it('does not restrict roles that do not require MFA', () => {
    const result = authenticateSession(record(), claims, NOW);
    expect(result.ok && isRestricted(result.user)).toBe(false);
  });

  it('de-duplicates permissions granted by several roles', () => {
    const multi = record({
      user: {
        roles: [
          { key: 'director', permissions: ['users:manage', 'leads:read'] },
          { key: 'technical_lead', permissions: ['leads:read'] },
        ],
      },
    });
    const result = authenticateSession(multi, claims, NOW);
    expect(result.ok && result.user.permissions).toEqual(['leads:read', 'users:manage']);
  });
});
