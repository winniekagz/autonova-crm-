import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../config/env.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, RefreshCookie } from './refresh-cookie.js';

const make = (nodeEnv: Env['NODE_ENV']) => {
  const config = { get: () => nodeEnv } as unknown as ConfigService<Env, true>;
  const response = { cookie: vi.fn(), clearCookie: vi.fn() };
  return { cookie: new RefreshCookie(config), response, res: response as unknown as Response };
};
const token = { value: 'v'.repeat(43), expiresAt: new Date('2030-01-01T00:00:00Z') };

describe('RefreshCookie', () => {
  it('sets HttpOnly, SameSite=Strict, a restricted path and no domain; Secure in production', () => {
    const { cookie, response, res } = make('production');
    cookie.set(res, token);
    expect(response.cookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, token.value, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: token.expiresAt,
    });
  });

  it.each(['development', 'test'] as const)('is not Secure in %s (plain http only)', (env) => {
    const { cookie, response, res } = make(env);
    cookie.set(res, token);
    expect(response.cookie.mock.calls[0]?.[2]).toMatchObject({ secure: false, httpOnly: true });
  });

  it('clears with exactly the attributes it sets with (minus expiry)', () => {
    const { cookie, response, res } = make('production');
    cookie.set(res, token);
    cookie.clear(res);
    const setOptions: Record<string, unknown> = { ...response.cookie.mock.calls[0]?.[2] };
    delete setOptions.expires;
    expect(response.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE_NAME, setOptions);
  });
});
