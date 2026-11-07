/**
 * CSRF defence for endpoints that act on a cookie the browser attaches by itself (refresh, logout).
 * Two independent checks, both required:
 *
 *  1. `Origin` must be one of the explicitly configured web origins. Browsers always send it on
 *     cross-origin and on same-origin POST requests; a request without it is not from our web app.
 *  2. A custom header with a fixed value. A cross-site form or `<img>` cannot add custom headers, and
 *     a cross-site `fetch` that does must pass a CORS preflight that only allowed origins pass.
 */
export const CSRF_HEADER = 'x-autonova-csrf';
export const CSRF_HEADER_VALUE = '1';

export type BrowserRequestCheck =
  { ok: true } | { ok: false; reason: 'origin_not_allowed' | 'csrf_header_invalid' };

export function checkBrowserRequest(input: {
  origin: string | undefined;
  csrfHeader: string | undefined;
  allowedOrigins: readonly string[];
}): BrowserRequestCheck {
  if (!input.origin || !input.allowedOrigins.includes(input.origin)) {
    return { ok: false, reason: 'origin_not_allowed' };
  }
  if (input.csrfHeader !== CSRF_HEADER_VALUE) return { ok: false, reason: 'csrf_header_invalid' };
  return { ok: true };
}
