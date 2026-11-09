import { describe, expect, it } from 'vitest';
import {
  addDays,
  canMoveQuotation,
  checkSendable,
  isPastValidity,
  nextQuotationStatuses,
} from './quotation-rules.js';

describe('quotation lifecycle', () => {
  it('moves draft to sent, then to accepted, rejected or expired, and never back', () => {
    expect(canMoveQuotation('DRAFT', 'SENT')).toBe(true);
    expect(canMoveQuotation('DRAFT', 'ACCEPTED')).toBe(false);
    expect(canMoveQuotation('SENT', 'ACCEPTED')).toBe(true);
    expect(canMoveQuotation('SENT', 'REJECTED')).toBe(true);
    expect(canMoveQuotation('SENT', 'EXPIRED')).toBe(true);
    for (const done of ['ACCEPTED', 'REJECTED', 'EXPIRED'] as const) {
      for (const to of ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const) {
        expect(canMoveQuotation(done, to), `${done} to ${to}`).toBe(false);
      }
    }
  });

  it('offers a person only the choices they can make; expiry is the system’s', () => {
    expect(nextQuotationStatuses('DRAFT')).toEqual(['SENT']);
    expect(nextQuotationStatuses('SENT')).toEqual(['ACCEPTED', 'REJECTED']);
    expect(nextQuotationStatuses('ACCEPTED')).toEqual([]);
  });

  it('treats the validity date as the last day it can be accepted', () => {
    expect(isPastValidity('2026-11-09', '2026-11-09')).toBe(false);
    expect(isPastValidity('2026-11-09', '2026-11-10')).toBe(true);
  });

  it('can be sent only with lines and a validity date that has not passed', () => {
    expect(
      checkSendable({ validUntil: '2026-12-01', today: '2026-11-09', lineCount: 2 }),
    ).toBeNull();
    expect(checkSendable({ validUntil: '2026-12-01', today: '2026-11-09', lineCount: 0 })).toBe(
      'NO_LINES',
    );
    expect(checkSendable({ validUntil: '2026-11-08', today: '2026-11-09', lineCount: 2 })).toBe(
      'ALREADY_PAST',
    );
  });

  it('adds days without a timezone or month-length surprise', () => {
    expect(addDays('2026-11-09', 30)).toBe('2026-12-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
