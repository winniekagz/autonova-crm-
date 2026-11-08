import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { createQueryClient, shouldRetryRead } from './query-client';

const err = (status: number, code = 'X') => new ApiError(status, code, 'm');

describe('shouldRetryRead', () => {
  it.each([
    ['a network failure', err(0, 'NETWORK_ERROR')],
    ['a 500', err(500)],
    ['a 503', err(503)],
  ])('retries %s once', (_label, error) => {
    expect(shouldRetryRead(0, error)).toBe(true);
    expect(shouldRetryRead(1, error)).toBe(false);
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('never retries a %i', (status) => {
    expect(shouldRetryRead(0, err(status))).toBe(false);
  });

  it('never retries a failure that is not an API answer (e.g. a contract mismatch)', () => {
    expect(shouldRetryRead(0, new Error('Unexpected lead response from the server'))).toBe(false);
    expect(shouldRetryRead(0, 'boom')).toBe(false);
    expect(shouldRetryRead(0, undefined)).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('uses the read policy by default and never retries writes', () => {
    const defaults = createQueryClient().getDefaultOptions();
    expect(defaults.queries?.retry).toBe(shouldRetryRead);
    expect(defaults.mutations?.retry).toBe(false);
    expect(defaults.queries?.staleTime).toBeUndefined();
  });

  it('lets a test override the defaults', () => {
    expect(createQueryClient({ retry: false }).getDefaultOptions().queries?.retry).toBe(false);
  });

  it('gives every caller its own client', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});
