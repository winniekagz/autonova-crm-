import { describe, expect, it } from 'vitest';
import { validateLeadLinks } from './lead-relationships.js';

const ok = { companyId: 'c1', primaryContactId: 'p1', additionalContactIds: ['a1', 'a2'] };

describe('validateLeadLinks', () => {
  it('accepts an individual prospect, a company alone, and a company with contacts', () => {
    expect(
      validateLeadLinks({ companyId: null, primaryContactId: null, additionalContactIds: [] }),
    ).toEqual({ ok: true });
    expect(
      validateLeadLinks({ companyId: 'c1', primaryContactId: null, additionalContactIds: [] }),
    ).toEqual({ ok: true });
    expect(validateLeadLinks(ok)).toEqual({ ok: true });
  });

  it('refuses contacts without a company', () => {
    expect(validateLeadLinks({ ...ok, companyId: null })).toEqual({
      ok: false,
      code: 'CONTACT_REQUIRES_COMPANY',
    });
    expect(
      validateLeadLinks({ companyId: null, primaryContactId: null, additionalContactIds: ['a1'] }),
    ).toEqual({
      ok: false,
      code: 'CONTACT_REQUIRES_COMPANY',
    });
  });

  it('refuses a contact listed twice, including as primary and additional', () => {
    expect(validateLeadLinks({ ...ok, additionalContactIds: ['a1', 'a1'] })).toEqual({
      ok: false,
      code: 'DUPLICATE_CONTACT',
    });
    expect(validateLeadLinks({ ...ok, additionalContactIds: ['p1'] })).toEqual({
      ok: false,
      code: 'DUPLICATE_CONTACT',
    });
  });

  it('caps the additional contacts', () => {
    const many = Array.from({ length: 21 }, (_, i) => `c${i}`);
    expect(
      validateLeadLinks({ companyId: 'c1', primaryContactId: null, additionalContactIds: many }),
    ).toEqual({
      ok: false,
      code: 'TOO_MANY_CONTACTS',
    });
  });
});
