import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { formatMoney, salesErrorText } from './sales-format';

describe('formatMoney', () => {
  it('groups thousands without touching the decimals or converting to a float', () => {
    expect(formatMoney('KES', '179800.00')).toBe('KES 179,800.00');
    expect(formatMoney('USD', '0.05')).toBe('USD 0.05');
    expect(formatMoney('KES', '999999999999.99')).toBe('KES 999,999,999,999.99');
    expect(formatMoney('KES', '1234567')).toBe('KES 1,234,567');
  });
});

describe('salesErrorText', () => {
  it('explains known codes and never echoes server text', () => {
    expect(
      salesErrorText(new ApiError(409, 'TOR_DISCOUNT_APPROVAL_REQUIRED', 'internal detail')),
    ).toMatch(/Director must approve/);
    expect(salesErrorText(new ApiError(409, 'TOR_SIGNED', '/var/secret'))).not.toContain('/var');
    expect(salesErrorText(new ApiError(500, 'WHATEVER', 'stack'))).toBe(
      'We could not complete the request. Try again.',
    );
    expect(salesErrorText(new ApiError(403, 'X', 'x'))).toBe('You do not have access to do this.');
    expect(salesErrorText(new Error('boom'))).toBe('We could not complete the request. Try again.');
  });
});
