import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type ApiResponseSchemaHost } from '@nestjs/swagger';

/** Swagger's own schema type, taken from the decorator that consumes it (it is not exported). */
export type SchemaObject = ApiResponseSchemaHost['schema'];

/**
 * OpenAPI description of the error envelope every failure uses (`ApiErrorBody` in
 * `@autonova/contracts`, produced by `ApiExceptionFilter`). Declared once so each operation can reuse
 * it instead of re-describing it.
 */
type ObjectSchema = SchemaObject & {
  required: string[];
  properties: Record<string, SchemaObject>;
};

export const API_ERROR_ENVELOPE: ObjectSchema = {
  type: 'object',
  required: ['statusCode', 'code', 'message', 'requestId', 'timestamp', 'path'],
  properties: {
    statusCode: { type: 'integer', example: 400 },
    code: {
      type: 'string',
      description: 'Stable machine-readable code; branch on this, not on `message`.',
    },
    message: { type: 'string', description: 'Safe, human-readable explanation.' },
    details: {
      type: 'array',
      description: 'Field-level problems; present for validation failures only.',
      items: {
        type: 'object',
        required: ['path', 'message'],
        properties: { path: { type: 'string', example: 'email' }, message: { type: 'string' } },
      },
    },
    requestId: {
      type: 'string',
      description: 'Quote this when reporting a problem; also in the `x-request-id` header.',
    },
    timestamp: { type: 'string', format: 'date-time' },
    path: { type: 'string' },
  },
};

/** One documented failure: its status, the stable `code` values it can carry, and when it happens. */
export interface DocumentedError {
  status: number;
  codes: readonly string[];
  when: string;
}

/**
 * Documents the failures an operation can return, using the shared error envelope.
 * `codes` are shown as the `code` enum so a client knows exactly what to branch on.
 */
export function ApiErrors(...errors: DocumentedError[]) {
  return applyDecorators(
    ...errors.map((error) =>
      ApiResponse({
        status: error.status,
        description: `${error.when} Possible \`code\`: ${error.codes.map((c) => `\`${c}\``).join(', ')}.`,
        schema: {
          ...API_ERROR_ENVELOPE,
          properties: {
            ...API_ERROR_ENVELOPE.properties,
            statusCode: { type: 'integer', example: error.status },
            code: { ...API_ERROR_ENVELOPE.properties.code, enum: [...error.codes] },
          },
        },
      }),
    ),
  );
}

/** Failures that any request can meet, so operations list only what is specific to them. */
export const UNAUTHENTICATED_ERROR: DocumentedError = {
  status: 401,
  codes: ['UNAUTHENTICATED', 'TOKEN_EXPIRED'],
  when: 'Missing, invalid or expired access token, or the session was revoked. `TOKEN_EXPIRED` means a valid token timed out: the web app renews it and retries.',
};
export const MFA_REQUIRED_ERROR: DocumentedError = {
  status: 403,
  codes: ['MFA_REQUIRED', 'FORBIDDEN'],
  when: '`MFA_REQUIRED`: a Director session that has not verified a second factor. `FORBIDDEN`: the account lacks the required permission.',
};
export const FORBIDDEN_ERROR: DocumentedError = {
  status: 403,
  codes: ['MFA_REQUIRED', 'FORBIDDEN'],
  when: 'The account lacks the required permission, or (`MFA_REQUIRED`) a Director session has not verified a second factor.',
};
export const VALIDATION_ERROR: DocumentedError = {
  status: 400,
  codes: ['VALIDATION_FAILED'],
  when: 'The request body, path or query is invalid; `details` lists each field.',
};
export const RATE_LIMITED_ERROR: DocumentedError = {
  status: 429,
  codes: ['RATE_LIMITED'],
  when: 'Too many requests from this address; wait and retry.',
};

/** Shorthand for a private (bearer) operation: sign-in problems and permission problems. */
export const privateErrors = [UNAUTHENTICATED_ERROR, FORBIDDEN_ERROR] as const;
