import type { TorVersionDto } from '@autonova/contracts';
import { describe, expect, it } from 'vitest';
import { blankTorForm, toTorRequest, torFormSchema, versionToForm } from './tor-form-schema';

const item = (over: { itemKey?: string; name?: string } = {}) => ({
  name: 'POS',
  description: '',
  inScope: true,
  estimateDays: '5',
  price: '40000',
  ...over,
});

const valid = () => ({
  ...blankTorForm(),
  setupFee: '100000',
  scopeItems: [
    { name: 'POS', description: '', inScope: true, estimateDays: '5', price: '40000' },
    { name: 'Loyalty', description: 'later', inScope: false, estimateDays: '2', price: '9999' },
  ],
});

describe('ToR form schema', () => {
  it('accepts a minimal valid form and rejects bad amounts and missing names', () => {
    expect(torFormSchema.safeParse(valid()).success).toBe(true);
    expect(torFormSchema.safeParse({ ...valid(), setupFee: '1e5' }).success).toBe(false);
    expect(torFormSchema.safeParse({ ...valid(), setupFee: '-1' }).success).toBe(false);
    expect(torFormSchema.safeParse({ ...valid(), setupFee: '1.234' }).success).toBe(false);
    const noName = { ...valid(), scopeItems: [item({ name: '  ' })] };
    expect(torFormSchema.safeParse(noName).success).toBe(false);
  });

  it('needs a billing cycle with a recurring amount, and a value with a discount', () => {
    const noCycle = torFormSchema.safeParse({ ...valid(), hostingAmount: '5000' });
    expect(noCycle.success).toBe(false);
    expect(noCycle.success ? [] : noCycle.error.issues.map((i) => i.path.join('.'))).toContain(
      'hostingCycle',
    );
    expect(
      torFormSchema.safeParse({ ...valid(), hostingAmount: '5000', hostingCycle: 'MONTHLY' })
        .success,
    ).toBe(true);
    expect(
      torFormSchema.safeParse({ ...valid(), discountType: 'PERCENT', discountValue: '0' }).success,
    ).toBe(false);
    expect(
      torFormSchema.safeParse({ ...valid(), discountType: 'PERCENT', discountValue: '101' })
        .success,
    ).toBe(false);
    expect(
      torFormSchema.safeParse({ ...valid(), discountType: 'AMOUNT', discountValue: '500' }).success,
    ).toBe(true);
  });

  it('refuses an add-on of zero quantity', () => {
    const bad = {
      ...valid(),
      addons: [{ kind: 'HARDWARE', description: 'Scanner', quantity: '0', unitPrice: '10' }],
    };
    expect(torFormSchema.safeParse(bad).success).toBe(false);
  });
});

describe('toTorRequest', () => {
  it('omits empty optional text, nulls an empty cycle, and charges nothing for out-of-scope items', () => {
    const body = toTorRequest(valid());
    expect(body).not.toHaveProperty('hostingName');
    expect(body).not.toHaveProperty('paymentTerms');
    expect(body.hostingCycle).toBeNull();
    expect(body.discountValue).toBe('0');
    expect(body.scopeItems.map((i) => i.price)).toEqual(['40000', '0']);
  });

  it('never includes a total: the server calculates every one', () => {
    const keys = Object.keys(toTorRequest(valid()));
    for (const forbidden of [
      'totals',
      'totalOneOff',
      'vatOneOff',
      'scopeTotal',
      'oneOffSubtotal',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('keeps an item key so a new round continues the same item', () => {
    const form = { ...valid(), scopeItems: [item({ itemKey: 'k-1' })] };
    expect(toTorRequest(form).scopeItems[0]).toMatchObject({ itemKey: 'k-1' });
  });

  it('round-trips a stored version through the form without losing the agreed content', () => {
    const version = {
      currency: 'USD',
      setupFee: '100.00',
      discountType: 'PERCENT',
      discountValue: '5.00',
      hostingName: 'Plan',
      hostingDescription: null,
      hostingCycle: 'ANNUAL',
      hostingAmount: '50.00',
      paymentTerms: '50% deposit',
      vatTreatment: 'EXEMPT',
      changeSummary: 'old summary',
      scopeItems: [
        {
          id: 'i',
          itemKey: 'k1',
          catalogueItemId: null,
          position: 0,
          name: 'POS',
          description: null,
          inScope: true,
          estimateDays: '5.00',
          price: '40.00',
        },
      ],
      addons: [
        {
          id: 'a',
          kind: 'HARDWARE',
          description: 'Scanner',
          quantity: '2.00',
          unitPrice: '10.00',
          lineTotal: '20.00',
        },
      ],
      milestones: [{ id: 'm', kind: 'GO_LIVE', name: 'Go live', targetDate: '2027-01-15' }],
    } as unknown as TorVersionDto;
    const form = versionToForm(version);
    expect(form.changeSummary).toBe('');
    const body = toTorRequest(form);
    expect(body).toMatchObject({
      currency: 'USD',
      hostingCycle: 'ANNUAL',
      vatTreatment: 'EXEMPT',
      paymentTerms: '50% deposit',
    });
    expect(body.scopeItems[0]).toMatchObject({ itemKey: 'k1', name: 'POS', price: '40.00' });
    expect(body.milestones).toEqual([
      { kind: 'GO_LIVE', name: 'Go live', targetDate: '2027-01-15' },
    ]);
  });
});
