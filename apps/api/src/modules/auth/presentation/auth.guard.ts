import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenService } from '../application/access-token.service.js';
import { SessionAuthenticator } from '../application/session-authenticator.js';
import { isRestricted } from '../domain/session-authentication.js';
import {
  ALLOW_RESTRICTED_KEY,
  ANY_AUTHENTICATED_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  type RequestWithUser,
} from './decorators.js';

export const UNAUTHENTICATED = {
  code: 'UNAUTHENTICATED',
  message: 'Authentication required',
} as const;
export const TOKEN_EXPIRED = { code: 'TOKEN_EXPIRED', message: 'Access token expired' } as const;
export const MFA_REQUIRED = {
  code: 'MFA_REQUIRED',
  message: 'A second factor must be verified before using this resource',
} as const;

export const FORBIDDEN = {
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
} as const;

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/**
 * Global, deny-by-default authentication. A route is private unless it is marked @Public().
 *
 * For private routes, on EVERY request: verify the token (signature, expiry, pinned algorithm),
 * then load the session and user from the database and apply `authenticateSession` — so a disabled
 * user, a revoked session or a changed role is effective on the very next request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly authenticator: SessionAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const match = header ? BEARER.exec(header) : null;
    if (!match?.[1]) throw new UnauthorizedException(UNAUTHENTICATED);

    const verified = await this.tokens.verify(match[1]);
    if (!verified.ok) {
      throw new UnauthorizedException(
        verified.reason === 'expired' ? TOKEN_EXPIRED : UNAUTHENTICATED,
      );
    }

    const result = await this.authenticator.authenticate(verified.claims);
    if (!result.ok) {
      // The client always sees the same generic 401; the cause is only for operators.
      this.logger.debug(
        { reason: result.reason, sid: verified.claims.sid },
        'Authentication rejected',
      );
      throw new UnauthorizedException(UNAUTHENTICATED);
    }

    const allowsRestricted = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_RESTRICTED_KEY,
      targets,
    );
    if (isRestricted(result.user) && !allowsRestricted) throw new ForbiddenException(MFA_REQUIRED);

    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (required && required.length > 0) {
      const held = new Set(result.user.permissions);
      const missing = required.filter((key) => !held.has(key));
      if (missing.length > 0) {
        this.logger.debug({ missing, userId: result.user.id }, 'Permission denied');
        throw new ForbiddenException(FORBIDDEN);
      }
    } else if (
      !this.reflector.getAllAndOverride<boolean | undefined>(ANY_AUTHENTICATED_KEY, targets)
    ) {
      // Fail closed: a private route that declares no authorization is a programming error.
      this.logger.error(
        { route: `${request.method} ${request.originalUrl}` },
        'Route declares neither @RequirePermission nor @AnyAuthenticatedUser; refusing',
      );
      throw new ForbiddenException(FORBIDDEN);
    }

    request.user = result.user;
    return true;
  }
}
