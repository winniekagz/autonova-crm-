import { describe, expect, it } from 'vitest';
import { requestIdOf } from './request-id.js';

describe('requestIdOf', () => {
  it('returns a string id unchanged', () => {
    expect(requestIdOf({ id: 'req-1' })).toBe('req-1');
  });

  it.each([
    ['missing', undefined],
    ['a number', 42],
    ['an object', { nested: true }],
    ['null', null],
  ])('returns undefined when the id is %s', (_label, id) => {
    expect(requestIdOf({ id } as unknown as { id: string })).toBeUndefined();
  });
});
