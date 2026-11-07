import { describe, expect, it } from 'vitest';
import { CSRF_HEADER_VALUE, checkBrowserRequest } from './browser-request.js';

const allowedOrigins = ['http://localhost:3000', 'https://crm.autonova.test'];
const valid = { origin: 'http://localhost:3000', csrfHeader: CSRF_HEADER_VALUE, allowedOrigins };

describe('checkBrowserRequest', () => {
  it('accepts an allowed origin with the custom header', () => {
    expect(checkBrowserRequest(valid)).toEqual({ ok: true });
    expect(checkBrowserRequest({ ...valid, origin: 'https://crm.autonova.test' })).toEqual({
      ok: true,
    });
  });

  it.each([
    ['a foreign origin', 'https://evil.example'],
    ['a missing origin', undefined],
    ['the literal string null (sandboxed iframes)', 'null'],
    ['an origin that merely starts with an allowed one', 'http://localhost:3000.evil.example'],
    ['a different port', 'http://localhost:3001'],
    ['a different scheme', 'https://localhost:3000'],
  ])('rejects %s', (_label, origin) => {
    expect(checkBrowserRequest({ ...valid, origin })).toEqual({
      ok: false,
      reason: 'origin_not_allowed',
    });
  });

  it.each([undefined, '', '0', 'true', 'yes'])('rejects the csrf header value %j', (csrfHeader) => {
    expect(checkBrowserRequest({ ...valid, csrfHeader })).toEqual({
      ok: false,
      reason: 'csrf_header_invalid',
    });
  });

  it('reports the origin first when both are wrong', () => {
    expect(
      checkBrowserRequest({
        origin: 'https://evil.example',
        csrfHeader: undefined,
        allowedOrigins,
      }),
    ).toEqual({ ok: false, reason: 'origin_not_allowed' });
  });
});
