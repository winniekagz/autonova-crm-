import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, toApiError } from './api-client';

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

describe('cookie credentials and CSRF header', () => {
  afterEach(() => vi.unstubAllGlobals());

  const capture = () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const lastInit = (fetchMock: ReturnType<typeof capture>) =>
    (fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1];

  it('ordinary requests send no cookies and no CSRF header', async () => {
    const fetchMock = capture();
    await apiRequest('/users', (j) => j, { token: 't' });
    const init = lastInit(fetchMock);
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('x-autonova-csrf')).toBeNull();
  });

  it('cookie requests include credentials and the CSRF header', async () => {
    const fetchMock = capture();
    await apiRequest('/auth/refresh', (j) => j, { method: 'POST', cookies: true });
    const init = lastInit(fetchMock);
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('x-autonova-csrf')).toBe('1');
  });
});
