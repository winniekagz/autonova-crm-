import type { BillingCycle, DiscountType, VatTreatment } from '@autonova/enums';
import { formatMoney, lineTotal, parseHundredths, parseMoney, percentOf, sum } from './money.js';

/**
 * Commercial totals of a ToR version, computed only here and always from the persisted figures, never from
 * the catalogue. Policy (PRD leaves tax rounding and discount scope open, Q16/Q17; these are the documented
 * working assumptions):
 *  - one-off subtotal = setup fee + priced in-scope items + add-ons. Out-of-scope items carry no charge.
 *  - the discount applies to the one-off subtotal only, never to the recurring plan;
 *  - VAT is computed once on the net one-off amount and once on the recurring amount per period, half-up;
 *  - an exempt document has zero VAT.
 */
export interface TorCommercialInput {
  setupFee: string;
  discountType: DiscountType;
  discountValue: string;
  hostingCycle: BillingCycle | null;
  hostingAmount: string;
  vatTreatment: VatTreatment;
  vatRate: string;
  scopeItems: readonly { inScope: boolean; price: string }[];
  addons: readonly { quantity: string; unitPrice: string }[];
}

export interface TorTotals {
  scopeTotal: string;
  addonsTotal: string;
  oneOffSubtotal: string;
  discountAmount: string;
  netOneOff: string;
  vatOneOff: string;
  totalOneOff: string;
  recurringVat: string;
  recurringTotal: string;
}

export type CalculationProblem =
  | 'INVALID_AMOUNT'
  | 'INVALID_QUANTITY'
  | 'INVALID_RATE'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL'
  | 'DISCOUNT_PERCENT_TOO_HIGH';

export type CalculationResult =
  | { ok: true; totals: TorTotals; discountPercentHundredths: bigint }
  | { ok: false; code: CalculationProblem };

const fail = (code: CalculationProblem): CalculationResult => ({ ok: false, code });

export function calculateTor(input: TorCommercialInput): CalculationResult {
  const setup = parseMoney(input.setupFee);
  const hosting = parseMoney(input.hostingAmount);
  const rate = parseHundredths(input.vatRate);
  if (setup === null || hosting === null) return fail('INVALID_AMOUNT');
  if (rate === null || rate > 10000n) return fail('INVALID_RATE');

  const scopePrices: bigint[] = [];
  for (const item of input.scopeItems) {
    const price = parseMoney(item.price);
    if (price === null) return fail('INVALID_AMOUNT');
    if (item.inScope) scopePrices.push(price);
  }
  const addonTotals: bigint[] = [];
  for (const addon of input.addons) {
    const quantity = parseHundredths(addon.quantity);
    const unit = parseMoney(addon.unitPrice);
    if (quantity === null || quantity === 0n) return fail('INVALID_QUANTITY');
    if (unit === null) return fail('INVALID_AMOUNT');
    addonTotals.push(lineTotal(quantity, unit));
  }

  const scopeTotal = sum(scopePrices);
  const addonsTotal = sum(addonTotals);
  const subtotal = setup + scopeTotal + addonsTotal;

  let discount = 0n;
  if (input.discountType === 'PERCENT') {
    const percent = parseHundredths(input.discountValue);
    if (percent === null) return fail('INVALID_AMOUNT');
    if (percent > 10000n) return fail('DISCOUNT_PERCENT_TOO_HIGH');
    discount = percentOf(subtotal, percent);
  } else if (input.discountType === 'AMOUNT') {
    const amount = parseMoney(input.discountValue);
    if (amount === null) return fail('INVALID_AMOUNT');
    if (amount > subtotal) return fail('DISCOUNT_EXCEEDS_SUBTOTAL');
    discount = amount;
  }

  const net = subtotal - discount;
  const exempt = input.vatTreatment === 'EXEMPT';
  const vatOneOff = exempt ? 0n : percentOf(net, rate);
  const recurringVat = exempt ? 0n : percentOf(hosting, rate);

  // The share of the subtotal that is discounted, in hundredths of a percent, for the approval rule.
  const discountPercentHundredths = subtotal === 0n ? 0n : (discount * 10000n) / subtotal;

  return {
    ok: true,
    discountPercentHundredths,
    totals: {
      scopeTotal: formatMoney(scopeTotal),
      addonsTotal: formatMoney(addonsTotal),
      oneOffSubtotal: formatMoney(subtotal),
      discountAmount: formatMoney(discount),
      netOneOff: formatMoney(net),
      vatOneOff: formatMoney(vatOneOff),
      totalOneOff: formatMoney(net + vatOneOff),
      recurringVat: formatMoney(recurringVat),
      recurringTotal: formatMoney(hosting + recurringVat),
    },
  };
}

/**
 * Does the discount need a Director before the ToR can be sent? Strictly above the threshold (PRD: "above
 * the configured threshold"). Compared in integers so 10.00% exactly is allowed and 10.01% is not.
 */
export function discountNeedsApproval(
  discountAmountCents: bigint,
  subtotalCents: bigint,
  thresholdPercentHundredths: bigint,
): boolean {
  if (subtotalCents === 0n || discountAmountCents === 0n) return false;
  return discountAmountCents * 10000n > subtotalCents * thresholdPercentHundredths;
}
