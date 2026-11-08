import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiErrors,
  VALIDATION_ERROR,
  privateErrors,
  type SchemaObject,
} from '../../../common/api-docs.js';

/**
 * Swagger documentation for user administration, kept out of the controller so the controller stays
 * a thin translation layer. The business rules live in the use cases and are described here only as
 * far as a caller needs to know them.
 */

export const userSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'email', 'fullName', 'status', 'roles', 'lastLoginAt', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    fullName: { type: 'string' },
    status: { type: 'string', enum: ['INVITED', 'ACTIVE', 'DISABLED'] },
    roles: { type: 'array', items: { type: 'string' }, description: 'Role keys, sorted.' },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const userNotFound = {
  status: 404,
  codes: ['USER_NOT_FOUND'],
  when: 'No user has this id.',
} as const;

/** Business-rule refusals (422) shared by the operations that change a user's access. */
const accessRules = (codes: readonly string[], when: string) =>
  ({ status: 422, codes, when }) as const;

const safeUser = (description: string) =>
  ApiResponse({
    status: 200,
    description: `${description} Never contains credentials.`,
    schema: userSchema,
  });

export const DocListUsers = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'A page of safe user records, with the total for paging.',
      schema: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: userSchema },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 25 },
          total: { type: 'integer', description: 'Matches across all pages.' },
        },
      },
    }),
    ApiErrors(...privateErrors, VALIDATION_ERROR),
  );

export const DocInviteUser = () =>
  applyDecorators(
    ApiResponse({
      status: 201,
      description: 'The new invited account. Created even if the email could not be delivered.',
      schema: userSchema,
    }),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      {
        status: 409,
        codes: ['EMAIL_ALREADY_REGISTERED'],
        when: 'An account with this email already exists (case and spaces are ignored).',
      },
      accessRules(['UNKNOWN_ROLE'], 'A requested role does not exist.'),
      {
        status: 503,
        codes: ['INVITATION_EMAIL_FAILED'],
        when: 'The account was created but the email could not be sent. Resend it once email is working.',
      },
    ),
  );

export const DocResendInvitation = () =>
  applyDecorators(
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      {
        status: 404,
        codes: ['INVITATION_NOT_AVAILABLE'],
        when: 'The account is unknown or is no longer waiting for an invitation.',
      },
      {
        status: 503,
        codes: ['INVITATION_EMAIL_FAILED'],
        when: 'The new link was created but the email could not be sent.',
      },
    ),
  );

export const DocGetUser = () =>
  applyDecorators(
    safeUser('One user.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, userNotFound),
  );

export const DocRenameUser = () =>
  applyDecorators(
    safeUser('The updated user.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, userNotFound),
  );

export const DocSetRoles = () =>
  applyDecorators(
    safeUser('The updated user.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      userNotFound,
      accessRules(
        ['SELF_ROLE_CHANGE_FORBIDDEN', 'LAST_DIRECTOR', 'NO_ROLES', 'UNKNOWN_ROLE'],
        'You cannot change your own roles; the change would leave no active Director; the list is empty; or a role does not exist.',
      ),
    ),
  );

export const DocDisableUser = () =>
  applyDecorators(
    safeUser('The disabled user. All of their sessions are revoked in the same transaction.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      userNotFound,
      accessRules(
        ['SELF_DISABLE_FORBIDDEN', 'LAST_DIRECTOR', 'USER_ALREADY_DISABLED'],
        'You cannot disable yourself; this would leave no active Director; or the user is already disabled.',
      ),
    ),
  );

export const DocListRoles = () =>
  applyDecorators(
    ApiResponse({
      status: 200,
      description: 'The system roles that can be assigned.',
      schema: {
        type: 'array',
        items: {
          type: 'object',
          required: ['key', 'name', 'description'],
          properties: {
            key: { type: 'string', example: 'business_development' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
          },
        },
      },
    }),
    ApiErrors(...privateErrors),
  );

export const DocAcceptInvitation = () =>
  applyDecorators(
    ApiErrors(
      VALIDATION_ERROR,
      {
        status: 400,
        codes: ['INVITATION_INVALID'],
        when: 'The link is unknown, expired, already used, or replaced by a newer one. One answer for every cause.',
      },
      {
        status: 429,
        codes: ['RATE_LIMITED'],
        when: 'More than 10 attempts per minute from this address.',
      },
    ),
  );
