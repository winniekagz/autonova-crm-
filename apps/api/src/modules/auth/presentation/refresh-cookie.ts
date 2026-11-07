import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../../../config/env.js';
import type { IssuedRefreshToken } from '../application/refresh-token.service.js';

export const REFRESH_COOKIE_NAME = 'autonova_refresh';
/** Covers refresh and logout; the browser sends the cookie to nothing else (docs/06). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * The single place that sets or clears the refresh cookie, so both always use identical attributes
 * (a cookie is only cleared if name, path and domain match how it was set).
 *
 * - HttpOnly: script in the page can never read it.
 * - SameSite=Strict: never sent on cross-site requests. The web app and API are same-site
 *   (same registrable domain; localhost ports count as same-site), which is what we deploy.
 * - Path: restricted to the auth endpoints.
 * - No Domain attribute: host-only, so sibling subdomains cannot receive it.
 * - Secure: always in production. Only NODE_ENV=development/test over plain http omits it;
 *   browsers treat http://localhost as a secure context, so production-mode builds on localhost
 *   (docker compose) still work with Secure set.
 */
@Injectable()
export class RefreshCookie {
  private readonly secure: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.secure = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  private get baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  set(response: Response, token: IssuedRefreshToken): void {
    response.cookie(REFRESH_COOKIE_NAME, token.value, {
      ...this.baseOptions,
      expires: token.expiresAt,
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.baseOptions);
  }
}
