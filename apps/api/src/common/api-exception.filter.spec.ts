import {
  BadRequestException,
  ForbiddenException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-1', originalUrl: '/api/v1/x', url: '/x' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('ApiExceptionFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps HttpExceptions to the standard envelope', () => {
    const { status, body } = run(new ForbiddenException('nope'));
    expect(status).toBe(403);
    expect(body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'nope',
      requestId: 'req-1',
      path: '/api/v1/x',
    });
  });

  it('reports an empty requestId when the request carries no usable id', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 42, originalUrl: '/api/v1/x', url: '/x' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    new ApiExceptionFilter().catch(new ForbiddenException('nope'), host);
    expect(json.mock.calls[0]?.[0].requestId).toBe('');
  });

  it('carries validation details and a custom code', () => {
    const { body } = run(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: 'email', message: 'Invalid email' }],
      }),
    );
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details).toEqual([{ path: 'email', message: 'Invalid email' }]);
  });

  it('never leaks internals for unknown errors', () => {
    const { status, body } = run(new Error('database password is hunter2'));
    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
