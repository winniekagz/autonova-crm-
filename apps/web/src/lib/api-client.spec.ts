import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from './api-client';

const response = (status: number, body: unknown) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('toApiError', () => {
  it('maps the API error envelope to code, message and details', async () => {
    const error = await toApiError(
      response(400, {
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: 'email', message: 'Invalid' }],
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(error.details).toEqual([{ path: 'email', message: 'Invalid' }]);
  });

  it('survives a non-JSON error body (e.g. a proxy error page)', async () => {
    const error = await toApiError(response(502, '<html>Bad gateway</html>'));
    expect(error).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
    expect(error.message).not.toContain('<html>');
  });

  it('survives JSON that is not the envelope', async () => {
    expect(await toApiError(response(500, { oops: true }))).toMatchObject({ code: 'HTTP_ERROR' });
  });
});
