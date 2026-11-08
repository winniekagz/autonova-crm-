import type { Request } from 'express';

/**
 * The correlation id `nestjs-pino` attached to this request (`genReqId` in app.module.ts), or
 * undefined when it is missing or not a string. One definition, so every place that reports a
 * request id (audit events, error envelopes) reads it the same way.
 */
export function requestIdOf(request: Pick<Request, 'id'>): string | undefined {
  return typeof request.id === 'string' ? request.id : undefined;
}
