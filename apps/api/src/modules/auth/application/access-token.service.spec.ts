import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../../config/env.js';
import { AccessTokenService } from './access-token.service.js';

const SECRET = 's'.repeat(48);
const USER = '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f60';
const SID = '0190b2f0-7a1e-7c3b-8d55-1b2c3d4e5f61';

const make = (secret = SECRET, ttl = 900) => {
  const values = { JWT_ACCESS_SECRET: secret, ACCESS_TOKEN_TTL_SECONDS: ttl };
  const config = { get: (k: keyof typeof values) => values[k] } as unknown as ConfigService<
    Env,
    true
  >;
  return new AccessTokenService(new JwtService({}), config);
};

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('AccessTokenService', () => {
  it('round-trips and carries exactly sub, sid, iat, exp — no roles or permissions', async () => {
    const service = make();
    const token = await service.sign(USER, SID);
    const result = await service.verify(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.claims).sort()).toEqual(['exp', 'iat', 'sid', 'sub']);
    expect(result.claims).toMatchObject({ sub: USER, sid: SID });
    expect(result.claims.exp - result.claims.iat).toBe(900);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await make('x'.repeat(48)).sign(USER, SID);
    expect(await make().verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports expiry distinctly from tampering', async () => {
    const service = make(SECRET, 1);
    const token = await service.sign(USER, SID);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(await service.verify(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects alg:none tokens', async () => {
    const forged = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
      sub: USER,
      sid: SID,
      iat: 1,
      exp: 9_999_999_999,
    })}.`;
    expect(await make().verify(forged)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects HS512 tokens: the algorithm is pinned to HS256', async () => {
    const token = await new JwtService({}).signAsync(
      { sub: USER, sid: SID },
      { secret: SECRET, algorithm: 'HS512', expiresIn: 60 },
    );
    expect(await make().verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a correctly signed token whose claims have the wrong shape', async () => {
    const token = await new JwtService({}).signAsync(
      { sub: 'not-a-uuid', sid: SID },
      { secret: SECRET, algorithm: 'HS256', expiresIn: 60 },
    );
    expect(await make().verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects garbage', async () => {
    expect(await make().verify('not.a.jwt')).toEqual({ ok: false, reason: 'invalid' });
  });
});
