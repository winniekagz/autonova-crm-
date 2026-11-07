import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import type { ApiErrorDetail } from '@autonova/contracts';
import { VALIDATION_FAILED } from './api-exception.filter.js';

type Issue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> };

export function toDetails(issues: ReadonlyArray<Issue>): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: (issue.path ?? []).map((s) => String(typeof s === 'object' ? s.key : s)).join('.'),
    message: issue.message,
  }));
}

/**
 * Runtime validation for every `@Body({ schema })`, `@Query({ schema })` and `@Param(..., { schema })`.
 * Shared TypeScript types never replace this: the schema is the gate.
 */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new BadRequestException({
        code: VALIDATION_FAILED,
        message: 'Request validation failed',
        details: toDetails(issues),
      }),
  });
}
