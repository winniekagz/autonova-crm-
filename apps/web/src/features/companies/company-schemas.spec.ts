import { describe, expect, it } from 'vitest';
import { companyFormSchema } from './company-form-schema';
import { blankCompany, toCompanyRequestBody, toFormValues } from './company-input';
import { contactFormSchema } from './contact-form-schema';
import { blankContact, toContactRequestBody } from './contact-input';
import { makeCompany, makeContact } from './company-test-fixtures';

const messages = (over: object) => {
  const result = companyFormSchema.safeParse({ ...blankCompany(), name: 'Acme', ...over });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('company form schema', () => {
  it('needs only a name', () => {
    expect(companyFormSchema.safeParse({ ...blankCompany(), name: 'Acme' }).success).toBe(true);
    expect(messages({ name: '   ' }).name).toMatch(/Enter the company/);
  });

  it('accepts a KRA PIN in any case and spacing, and rejects other shapes', () => {
    expect(messages({ kraPin: 'a 123456789 b' }).kraPin).toBeUndefined();
    expect(messages({ kraPin: '12345' }).kraPin).toMatch(/KRA PIN/);
    expect(messages({ kraPin: '' }).kraPin).toBeUndefined();
  });

  it('checks counts, web addresses and link count like the API', () => {
    expect(messages({ staffCount: -1 }).staffCount).toMatch(/cannot be negative/);
    expect(messages({ staffCount: 1.5 }).staffCount).toMatch(/whole number/);
    expect(messages({ branchCount: 10_001 }).branchCount).toMatch(/at most/);
    expect(messages({ website: 'javascript:alert(1)' }).website).toMatch(/https/);
    expect(messages({ website: 'https://ok.test' }).website).toBeUndefined();
    expect(messages({ socialLinks: 'https://a.test\nnot a link' }).socialLinks).toMatch(
      /one full web address/,
    );
    expect(
      messages({ socialLinks: Array(11).fill('https://a.test').join('\n') }).socialLinks,
    ).toMatch(/at most 10/);
  });
});

describe('company input mapping', () => {
  it('round-trips a saved company through the form', () => {
    const values = toFormValues(makeCompany({ socialLinks: ['https://a.test', 'https://b.test'] }));
    expect(values.socialLinks).toBe('https://a.test\nhttps://b.test');
    expect(toCompanyRequestBody(values)).toMatchObject({
      name: 'Otieno Logistics',
      kraPin: 'A123456789B',
      industry: 'LOGISTICS',
      staffCount: 40,
      socialLinks: ['https://a.test', 'https://b.test'],
    });
  });

  it('trims, upper-cases the PIN, removes duplicate links and keeps blanks empty', () => {
    const body = toCompanyRequestBody({
      ...blankCompany(),
      name: '  Acme  ',
      kraPin: ' a123456789b ',
      socialLinks: ' https://a.test \nhttps://a.test\n\n',
    });
    expect(body).toMatchObject({
      name: 'Acme',
      kraPin: 'A123456789B',
      location: '',
      socialLinks: ['https://a.test'],
    });
    expect(body.staffCount).toBeNull();
  });
});

describe('contact form', () => {
  it('needs a name, validates email, and normalises for the request', () => {
    expect(contactFormSchema.safeParse({ ...blankContact(), name: '' }).success).toBe(false);
    expect(
      contactFormSchema.safeParse({ ...blankContact(), name: 'A', email: 'nope' }).success,
    ).toBe(false);
    expect(contactFormSchema.safeParse({ ...blankContact(), name: 'A' }).success).toBe(true);
    expect(
      toContactRequestBody({
        ...blankContact(),
        name: ' A ',
        email: ' A@B.TEST ',
        jobTitle: ' CFO ',
      }),
    ).toMatchObject({
      name: 'A',
      email: 'a@b.test',
      jobTitle: 'CFO',
      isDecisionMaker: false,
    });
    expect(
      toContactRequestBody({
        ...blankContact(),
        name: 'x',
        phone: makeContact().phone ?? '',
      }).phone,
    ).toBe('0712 345 678');
  });
});
