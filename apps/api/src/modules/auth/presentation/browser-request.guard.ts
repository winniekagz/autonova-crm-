import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../../config/env.js';
import { CSRF_HEADER, checkBrowserRequest } from '../domain/browser-request.js';

export const CSRF_REJECTED = {
  code: 'CSRF_REJECTED',
  message: 'Request origin or headers are not allowed',
} as const;

/**
 * Apply with @UseGuards to every endpoint that is authenticated by the refresh cookie. Runs before
 * the handler, so a forged cross-site request is refused before any token is looked at, and it
 * never clears the cookie (an attacker must not be able to sign a user out).
 */
@Injectable()
export class BrowserRequestGuard implements CanActivate {
  private readonly logger = new Logger(BrowserRequestGuard.name);
  private readonly allowedOrigins: readonly string[];

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = config.get('CORS_ORIGINS', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const csrfHeader = request.headers[CSRF_HEADER];
    const result = checkBrowserRequest({
      origin: request.headers.origin,
      csrfHeader: typeof csrfHeader === 'string' ? csrfHeader : undefined,
      allowedOrigins: this.allowedOrigins,
    });
    if (result.ok) return true;
    // Reason only; never header or cookie values.
    this.logger.warn({ reason: result.reason, path: request.path }, 'Browser request rejected');
    throw new ForbiddenException(CSRF_REJECTED);
  }
}
