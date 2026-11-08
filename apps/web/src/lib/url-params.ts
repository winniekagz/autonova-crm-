/**
 * Reading and writing list state (search, filters, page) in the URL. The URL is typed by people and
 * edited by anyone holding a link, so every value is validated on the way in: a bad value falls
 * back to "not set" and never reaches the API as a malformed request.
 */

/** The API rejects longer search text (`z.string().max(100)`). */
export const MAX_SEARCH_LENGTH = 100;

/** A positive whole number up to six digits; anything else is page 1. */
export function readPage(value: string | null): number {
  return value !== null && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
}

export function readSearch(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
}

/** The value if it is one of `allowed`, otherwise '' (no filter). */
export function readChoice<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return allowed.find((candidate) => candidate === value) ?? '';
}

/** `null` for page 1 so the default never clutters the URL. */
export const pageParam = (page: number): number | null => (page > 1 ? page : null);

/**
 * The query string (with its leading `?`, or '' when empty) after applying `changes` to `current`.
 * `null`, `undefined` and '' remove a parameter. Parameters not mentioned are kept as they are.
 */
export function withParams(
  current: URLSearchParams | string,
  changes: Record<string, string | number | null | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(changes)) {
    const text = value === null || value === undefined ? '' : String(value);
    if (text === '') next.delete(key);
    else next.set(key, text);
  }
  const query = next.toString();
  return query ? `?${query}` : '';
}
