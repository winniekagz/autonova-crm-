import { describe, expect, it } from 'vitest';
import { calculateTor, discountNeedsApproval, type TorCommercialInput } from './tor-calculator.js';

const base: TorCommercialInput = {
  setupFee: '100000.00',
  discountType: 'NONE',
  discountValue: '0',
  hostingCycle: 'MONTHLY',
  hostingAmount: '5000.00',
  vatTreatment: 'APPLIED',
  vatRate: '16',
  scopeItems: [
    { inScope: true, price: '40000.00' },
    { inScope: true, price: '10000.50' },
    { inScope: false, price: '99999.00' },
  ],
  addons: [
    { quantity: '2', unitPrice: '7500.00' },
    { quantity: '0.5', unitPrice: '3.00' },
  ],
};

const totalsOf = (over: Partial<TorCommercialInput>) => {
  const result = calculateTor({ ...base, ...over });
  if (!result.ok) throw new Error(result.code);
  return result.totals;
};

describe('ToR commercial calculation', () => {
  it('adds the setup fee, in-scope items and add-ons, ignoring out-of-scope items', () => {
    const t = totalsOf({});
    expect(t.scopeTotal).toBe('50000.50');
    expect(t.addonsTotal).toBe('15001.50');
    expect(t.oneOffSubtotal).toBe('165002.00');
    expect(t.discountAmount).toBe('0.00');
    expect(t.netOneOff).toBe('165002.00');
  });

  it('applies 16% VAT once on the net one-off amount and on the recurring plan', () => {
    const t = totalsOf({});
    expect(t.vatOneOff).toBe('26400.32');
    expect(t.totalOneOff).toBe('191402.32');
    expect(t.recurringVat).toBe('800.00');
    expect(t.recurringTotal).toBe('5800.00');
  });

  it('charges no VAT on an exempt document', () => {
    const t = totalsOf({ vatTreatment: 'EXEMPT' });
    expect(t.vatOneOff).toBe('0.00');
    expect(t.totalOneOff).toBe('165002.00');
    expect(t.recurringVat).toBe('0.00');
    expect(t.recurringTotal).toBe('5000.00');
  });

  it('takes a percentage discount off the one-off subtotal only, before VAT', () => {
    const t = totalsOf({ discountType: 'PERCENT', discountValue: '10' });
    expect(t.discountAmount).toBe('16500.20');
    expect(t.netOneOff).toBe('148501.80');
    expect(t.vatOneOff).toBe('23760.29');
    expect(t.totalOneOff).toBe('172262.09');
    expect(t.recurringTotal).toBe('5800.00');
  });

  it('takes a fixed discount off before VAT and refuses one larger than the subtotal', () => {
    const t = totalsOf({ discountType: 'AMOUNT', discountValue: '5002.00' });
    expect(t.netOneOff).toBe('160000.00');
    expect(t.vatOneOff).toBe('25600.00');
    expect(calculateTor({ ...base, discountType: 'AMOUNT', discountValue: '165002.01' })).toEqual({
      ok: false,
      code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
    });
    expect(totalsOf({ discountType: 'AMOUNT', discountValue: '165002.00' }).totalOneOff).toBe(
      '0.00',
    );
  });

  it('refuses a percentage over 100 and malformed amounts instead of guessing', () => {
    expect(calculateTor({ ...base, discountType: 'PERCENT', discountValue: '100.01' })).toEqual({
      ok: false,
      code: 'DISCOUNT_PERCENT_TOO_HIGH',
    });
    expect(calculateTor({ ...base, setupFee: '1e5' })).toEqual({
      ok: false,
      code: 'INVALID_AMOUNT',
    });
    expect(calculateTor({ ...base, vatRate: '101' })).toEqual({ ok: false, code: 'INVALID_RATE' });
    expect(calculateTor({ ...base, addons: [{ quantity: '0', unitPrice: '1' }] })).toEqual({
      ok: false,
      code: 'INVALID_QUANTITY',
    });
  });

  it('is exact where binary floating point is not', () => {
    const t = totalsOf({
      setupFee: '0.10',
      scopeItems: [{ inScope: true, price: '0.20' }],
      addons: [],
      hostingAmount: '0',
    });
    expect(t.oneOffSubtotal).toBe('0.30');
    expect(t.vatOneOff).toBe('0.05');
    expect(t.totalOneOff).toBe('0.35');
  });

  it('handles an empty ToR as all zeros', () => {
    const t = totalsOf({ setupFee: '0', scopeItems: [], addons: [], hostingAmount: '0' });
    expect(Object.values(t).every((v) => v === '0.00')).toBe(true);
  });
});

describe('discount approval threshold', () => {
  it('needs a Director strictly above the threshold, not at it', () => {
    const subtotal = 100000n;
    expect(discountNeedsApproval(10000n, subtotal, 1000n)).toBe(false);
    expect(discountNeedsApproval(10001n, subtotal, 1000n)).toBe(true);
    expect(discountNeedsApproval(0n, subtotal, 1000n)).toBe(false);
    expect(discountNeedsApproval(5n, 0n, 1000n)).toBe(false);
  });
});
