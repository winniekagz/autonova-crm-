import { describe, expect, it } from 'vitest';
import {
  companyDuplicateCheckSchema,
  createCompanySchema,
  createContactSchema,
  listCompaniesQuerySchema,
  updateCompanySchema,
  updateContactSchema,
} from './companies.schemas.js';

describe('company validation', () => {
  it('needs only a name', () => {
    expect(createCompanySchema.safeParse({ name: 'Northstar' }).success).toBe(true);
    expect(createCompanySchema.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('checks KRA PIN format and treats a blank PIN as absent', () => {
    expect(createCompanySchema.safeParse({ name: 'A', kraPin: 'a123456789b' }).success).toBe(true);
    expect(createCompanySchema.safeParse({ name: 'A', kraPin: '' }).success).toBe(true);
    const bad = createCompanySchema.safeParse({ name: 'A', kraPin: '12345' });
    expect(bad.success).toBe(false);
  });

  it('bounds counts, links and industry', () => {
    expect(createCompanySchema.safeParse({ name: 'A', staffCount: -1 }).success).toBe(false);
    expect(createCompanySchema.safeParse({ name: 'A', branchCount: 1.5 }).success).toBe(false);
    expect(
      createCompanySchema.safeParse({ name: 'A', industry: 'RETAIL', staffCount: 12 }).success,
    ).toBe(true);
    expect(createCompanySchema.safeParse({ name: 'A', industry: 'Shops' }).success).toBe(false);
    expect(
      createCompanySchema.safeParse({ name: 'A', website: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(createCompanySchema.safeParse({ name: 'A', website: 'https://a.test' }).success).toBe(
      true,
    );
    expect(
      createCompanySchema.safeParse({ name: 'A', socialLinks: Array(11).fill('https://a.test') })
        .success,
    ).toBe(false);
  });

  it('refuses unknown and system-managed fields', () => {
    expect(createCompanySchema.safeParse({ name: 'A', createdByUserId: 'x' }).success).toBe(false);
    expect(createCompanySchema.safeParse({ name: 'A', archivedAt: 'now' }).success).toBe(false);
    expect(updateCompanySchema.safeParse({ nameNormalized: 'x' }).success).toBe(false);
  });

  it('requires a real change on update, not only the acknowledgement', () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(false);
    expect(updateCompanySchema.safeParse({ acknowledgeDuplicates: true }).success).toBe(false);
    expect(
      updateCompanySchema.safeParse({ location: 'Nairobi', acknowledgeDuplicates: true }).success,
    ).toBe(true);
  });

  it('validates the list query and the duplicate-check body', () => {
    expect(listCompaniesQuerySchema.parse({ page: '2', q: ' acme ' })).toMatchObject({
      page: 2,
      q: 'acme',
    });
    expect(listCompaniesQuerySchema.safeParse({ industry: 'x' }).success).toBe(false);
    expect(listCompaniesQuerySchema.safeParse({ pageSize: '1000' }).success).toBe(false);
    expect(
      companyDuplicateCheckSchema.safeParse({ name: 'Acme', kraPin: 'A123456789B' }).success,
    ).toBe(true);
    expect(companyDuplicateCheckSchema.safeParse({ excludeCompanyId: 'nope' }).success).toBe(false);
  });
});

describe('contact validation', () => {
  it('needs a name and the decision-maker flag, with optional details', () => {
    expect(createContactSchema.safeParse({ name: 'Wanjiru', isDecisionMaker: false }).success).toBe(
      true,
    );
    expect(createContactSchema.safeParse({ name: 'Wanjiru' }).success).toBe(false);
    expect(
      createContactSchema.safeParse({ name: 'W', isDecisionMaker: true, email: 'nope' }).success,
    ).toBe(false);
    expect(
      createContactSchema.safeParse({ name: 'W', isDecisionMaker: true, email: '' }).success,
    ).toBe(true);
  });

  it('accepts a known contact role or none, and refuses anything else', () => {
    const base = { name: 'W', isDecisionMaker: false };
    expect(createContactSchema.safeParse({ ...base, role: 'FINANCE' }).success).toBe(true);
    expect(createContactSchema.safeParse({ ...base, role: null }).success).toBe(true);
    expect(createContactSchema.safeParse({ ...base, role: 'CEO' }).success).toBe(false);
    expect(updateContactSchema.safeParse({ role: null }).success).toBe(true);
  });

  it('cannot move a contact to another company or set system fields', () => {
    expect(
      updateContactSchema.safeParse({ companyId: '0192f1a0-0000-7000-8000-000000000001' }).success,
    ).toBe(false);
    expect(updateContactSchema.safeParse({}).success).toBe(false);
    expect(updateContactSchema.safeParse({ isDecisionMaker: true }).success).toBe(true);
  });
});
