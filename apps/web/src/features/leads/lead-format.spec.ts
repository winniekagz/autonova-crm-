import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { labelFor, leadErrorText } from './lead-format';

describe('labelFor', () => {
  it.each([
    ['NEW_LEAD', 'New Lead'],
    ['WALK_IN', 'Walk In'],
    ['EXISTING_CLIENT_UPSELL', 'Existing Client Upsell'],
    ['WEBSITE', 'Website'],
  ])('%s -> %s', (value, label) => expect(labelFor(value)).toBe(label));
});

describe('leadErrorText', () => {
  const err = (status: number) => new ApiError(status, 'X', 'raw backend detail');

  it.each([
    [403, 'You do not have access to this lead.'],
    [404, 'This lead is unavailable in your pipeline.'],
    [401, 'Your session ended. Sign in again.'],
    [500, 'We could not complete the request. Check the details and try again.'],
    [409, 'We could not complete the request. Check the details and try again.'],
  ])('status %i is explained in plain language', (status, text) => {
    expect(leadErrorText(err(status))).toBe(text);
  });

  it('never echoes server text and copes with values that are not errors', () => {
    expect(leadErrorText(err(500))).not.toContain('raw backend detail');
    for (const thrown of [undefined, null, 'boom', 42, { status: 403 }]) {
      expect(leadErrorText(thrown)).toContain('We could not complete the request');
    }
  });
});
