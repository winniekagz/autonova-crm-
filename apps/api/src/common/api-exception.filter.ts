import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ApiErrorDetail, HealthResponse } from '@autonova/contracts';
import type { Request, Response } from 'express';

export const VALIDATION_FAILED = 'VALIDATION_FAILED';

const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

interface ExceptionPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function isDetails(value: unknown): value is ApiErrorDetail[] {
  return (
    Array.isArray(value) &&
    value.every((d) => typeof d === 'object' && d !== null && 'path' in d && 'message' in d)
  );
}

function isHealthFailure(value: unknown): value is HealthResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'error' &&
    'details' in value
  );
}

/**
 * Converts every thrown error into the ApiErrorBody envelope (docs/05-api-conventions.md).
 * Unknown errors are logged with their stack but never leak internals to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: ApiErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = CODE_BY_STATUS[statusCode] ?? 'HTTP_ERROR';
      const payload = exception.getResponse();
      if (isHealthFailure(payload)) {
        // Terminus' readiness body (HealthResponse) is the contract for probes; keep it intact.
        response.status(statusCode).json(payload);
        return;
      }
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const body = payload as ExceptionPayload;
        if (typeof body.code === 'string') code = body.code;
        if (typeof body.message === 'string') message = body.message;
        else message = exception.message;
        if (isDetails(body.details)) details = body.details;
      }
    } else {
      this.logger.error({ err: exception, requestId: request.id }, 'Unhandled exception');
    }

    const body: ApiErrorBody = {
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      requestId: typeof request.id === 'string' ? request.id : '',
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
    };
    response.status(statusCode).json(body);
  }
}
