import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ApiErrors,
  RATE_LIMITED_ERROR,
  type SchemaObject,
  VALIDATION_ERROR,
  privateErrors,
} from '../../../common/api-docs.js';

/**
 * Swagger documentation for the auth endpoints, kept out of the controller so the controller stays
 * a thin translation layer. Behaviour lives in the use cases; this file only describes it.
 */

const tokenBody: SchemaObject = {
  type: 'object',
  required: ['accessToken', 'tokenType', 'expiresIn', 'mfaRequired'],
  properties: {
    accessToken: { type: 'string', description: 'JWT for the `Authorization: Bearer` header.' },
    tokenType: { type: 'string', enum: ['Bearer'] },
    expiresIn: {
      type: 'integer',
      example: 900,
      description: 'Seconds until the access token expires.',
    },
    mfaRequired: {
      type: 'boolean',
      description: 'True when a second factor must be verified before the session is fully usable.',
    },
  },
};

export const DocLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Sign in with email and password',
      description:
        'Returns a 15-minute bearer `accessToken` and sets the HttpOnly `autonova_refresh` cookie (never in the body). A wrong password, an unknown email and a disabled or not-yet-activated account all return the same `401 INVALID_CREDENTIALS`. Limited to 10 attempts per minute per address. For a Director, `mfaRequired` is true and the session stays restricted until the second factor is verified.',
    }),
    ApiResponse({
      status: 200,
      description: 'Signed in. The refresh cookie is set on this response.',
      schema: tokenBody,
    }),
    ApiErrors(
      VALIDATION_ERROR,
      {
        status: 401,
        codes: ['INVALID_CREDENTIALS'],
        when: 'Wrong email or password, or the account cannot sign in. The cause is never disclosed.',
      },
      RATE_LIMITED_ERROR,
    ),
    ApiBody({
      examples: {
        credentials: {
          summary: 'Use a provisioned account',
          value: { email: 'director@example.test', password: 'replace-with-provisioned-password' },
        },
      },
      schema: {
        type: 'object',
        required: ['email', 'password'],
        additionalProperties: false,
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', maxLength: 128 },
        },
      },
    }),
  );

export const DocRefresh = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Exchange the HttpOnly refresh cookie for a new access token',
      description:
        'Reads the refresh token from the `autonova_refresh` cookie, rotates it (the old one stops working) and returns a new access token with a fresh cookie. Requires an allowed `Origin` and the `X-Autonova-CSRF: 1` header. Presenting a token that was already exchanged is treated as theft: the whole session is revoked. Never changes MFA state: a restricted Director session stays restricted. In the local Swagger UI, sign in first so the browser has the HttpOnly cookie; Swagger adds the CSRF header automatically.',
    }),
    ApiResponse({
      status: 200,
      description:
        'New access token (same shape as login). The rotated refresh cookie is set on this response.',
      schema: tokenBody,
    }),
    ApiErrors(
      {
        status: 401,
        codes: ['REFRESH_TOKEN_INVALID'],
        when: 'Missing, malformed, unknown, expired or replayed refresh token, an ended session, or a disabled user. One answer for every cause; the cookie is cleared and the user must sign in again.',
      },
      {
        status: 403,
        codes: ['CSRF_REJECTED'],
        when: 'The `Origin` is not an allowed web origin or the `X-Autonova-CSRF` header is missing. The refresh cookie is left untouched.',
      },
      RATE_LIMITED_ERROR,
    ),
  );

export const DocMe = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Current user with current roles and permissions',
      description:
        'Roles and permissions are read from the database on every request, never from the token. Available while a Director session is still restricted, so a client can learn what to do next.',
    }),
    ApiResponse({
      status: 200,
      description: 'The signed-in user.',
      schema: {
        type: 'object',
        required: ['id', 'email', 'fullName', 'roles', 'permissions', 'mfa', 'restricted'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
          roles: { type: 'array', items: { type: 'string' } },
          permissions: { type: 'array', items: { type: 'string', example: 'users:list' } },
          mfa: {
            type: 'object',
            required: ['required', 'verified'],
            properties: { required: { type: 'boolean' }, verified: { type: 'boolean' } },
          },
          restricted: {
            type: 'boolean',
            description:
              'True while the session owes a second factor and can only reach the MFA endpoints.',
          },
        },
      },
    }),
    ApiErrors(...privateErrors),
  );

export const DocLogout = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Revoke the current session and its refresh tokens',
      description:
        'Ends this session immediately, invalidates its refresh tokens and clears the refresh cookie. Available to a restricted Director session. Calling it again with the same token returns 401, because the token is already dead.',
    }),
    ApiResponse({ status: 204, description: 'Session revoked; the refresh cookie is cleared.' }),
    ApiErrors(...privateErrors),
  );

const sessionSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'createdAt', 'expiresAt', 'current', 'ip', 'userAgent'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    current: { type: 'boolean', description: 'True for the session making this request.' },
    ip: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
  },
};

export const DocListSessions = () =>
  applyDecorators(
    ApiOperation({
      summary: 'List your own active sessions',
      description:
        'Only the caller’s own live sessions, newest first. Revoked and expired sessions are not listed. Never returns token data.',
    }),
    ApiResponse({
      status: 200,
      description: 'The caller’s active sessions.',
      schema: { type: 'array', items: sessionSchema },
    }),
    ApiErrors(...privateErrors),
  );

export const DocRevokeSession = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Revoke one of your own sessions',
      description:
        'Revokes the session and every refresh token it owns. Revoking the current session also clears the refresh cookie; revoking another session never touches yours. Unknown, foreign and already-ended sessions all answer the same 404, so other people’s session ids cannot be probed.',
    }),
    ApiResponse({ status: 204, description: 'Session revoked.' }),
    ApiErrors(...privateErrors, VALIDATION_ERROR, {
      status: 404,
      codes: ['SESSION_NOT_FOUND'],
      when: 'The session does not exist, belongs to someone else, or has already ended.',
    }),
  );

const mfaCodeErrors = [
  VALIDATION_ERROR,
  ...privateErrors,
  {
    status: 401,
    codes: ['MFA_CODE_INVALID'],
    when: 'The code was not accepted: wrong, expired, or an already-used time step. Failures count toward the lockout.',
  },
  {
    status: 429,
    codes: ['MFA_RATE_LIMITED'],
    when: 'Five failures lock MFA attempts for 15 minutes.',
  },
] as const;

export const DocMfaStatus = () =>
  applyDecorators(
    ApiErrors(...privateErrors, {
      status: 403,
      codes: ['MFA_DIRECTOR_ONLY'],
      when: 'The signed-in user does not hold a role that uses MFA.',
    }),
  );

export const DocMfaBeginEnrollment = () =>
  applyDecorators(
    ApiErrors(
      ...privateErrors,
      {
        status: 403,
        codes: ['MFA_DIRECTOR_ONLY'],
        when: 'The signed-in user does not hold a role that uses MFA.',
      },
      {
        status: 409,
        codes: ['MFA_ALREADY_ENROLLED'],
        when: 'MFA is already enrolled. Use a recovery code or ask another Director.',
      },
    ),
  );

export const DocMfaConfirmEnrollment = () => applyDecorators(ApiErrors(...mfaCodeErrors));

export const DocMfaVerify = () => applyDecorators(ApiErrors(...mfaCodeErrors));

export const DocMfaRecover = () =>
  applyDecorators(
    ApiErrors(
      VALIDATION_ERROR,
      ...privateErrors,
      {
        status: 401,
        codes: ['MFA_RECOVERY_INVALID'],
        when: 'The recovery code was not accepted: wrong or already used. Failures count toward the lockout.',
      },
      {
        status: 429,
        codes: ['MFA_RATE_LIMITED'],
        when: 'Five failures lock MFA attempts for 15 minutes.',
      },
    ),
  );
