import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from '@autonova/enums';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../domain/authenticated-user.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ALLOW_RESTRICTED_KEY = 'auth:allowRestricted';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ANY_AUTHENTICATED_KEY = 'auth:anyAuthenticated';

/** Opts a route out of the global authentication guard. Every use is listed by a test. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Lets a session that still owes a second factor reach this route (MFA enrolment/verification,
 * `/auth/me` so the client can learn what to do, logout). Everything else is blocked for it.
 */
export const AllowRestrictedSession = () => SetMetadata(ALLOW_RESTRICTED_KEY, true);

/**
 * The caller must currently hold ALL of these permissions (resolved from the database on this
 * request, never from the token). No wildcards exist; list each permission explicitly.
 */
export const RequirePermission = (...keys: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, keys);

/**
 * Explicit marker for routes any signed-in user may call (`/auth/me`, logout). A private route
 * with neither this nor @RequirePermission is refused by the guard, so forgetting to declare
 * authorization fails closed.
 */
export const AnyAuthenticatedUser = () => SetMetadata(ANY_AUTHENTICATED_KEY, true);

export type RequestWithUser = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
  if (!user) {
    // Only reachable if a route was marked @Public() but still asks for a user: a programmer error.
    throw new Error('CurrentUser used on a route without an authenticated user');
  }
  return user;
});
