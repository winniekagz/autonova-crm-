import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { calculateTor, type CalculationProblem } from '../domain/tor-calculator.js';
import { parseHundredths, parseMoney } from '../domain/money.js';
import type { CatalogueRepository } from '../infrastructure/catalogue.repository.js';
import type { VersionRow, VersionWrite } from '../infrastructure/tors.repository.js';
import type { TorVersionBody } from '../presentation/tors.schemas.js';

const CATALOGUE_UNAVAILABLE = {
  code: 'TOR_CATALOGUE_ITEM_UNAVAILABLE',
  message: 'One of the chosen catalogue items does not exist or is no longer active.',
};
const CALC_MESSAGES: Record<CalculationProblem, string> = {
  INVALID_AMOUNT: 'One of the amounts is not a valid non-negative amount with up to two decimals.',
  INVALID_QUANTITY: 'Every add-on needs a quantity greater than zero.',
  INVALID_RATE: 'The VAT rate must be between 0 and 100.',
  DISCOUNT_EXCEEDS_SUBTOTAL: 'The discount cannot be more than the one-off subtotal.',
  DISCOUNT_PERCENT_TOO_HIGH: 'A percentage discount cannot be more than 100.',
};
/** Working assumption until Q17 is decided: Kenyan VAT, applied or the document is shown as exempt. */
const VAT_RATE = '16.00';

/**
 * Turns the request into persisted, validated figures. Catalogue items are COPIED here (name, days,
 * price), so a later catalogue edit never changes a ToR. Totals are computed by the backend only.
 */
export async function prepareVersion(
  catalogueRepo: CatalogueRepository,
  input: TorVersionBody,
  previous: VersionRow | null,
): Promise<VersionWrite> {
  const ids = input.scopeItems.flatMap((i) => (i.catalogueItemId ? [i.catalogueItemId] : []));
  const found = await catalogueRepo.activeByIds([...new Set(ids)]);
  const previousKeys = new Set(previous?.scopeItems.map((i) => i.itemKey) ?? []);
  const scopeItems = input.scopeItems.map((item) => {
    const source = item.catalogueItemId ? found.get(item.catalogueItemId) : undefined;
    if (item.catalogueItemId && !source) throw new BadRequestException(CATALOGUE_UNAVAILABLE);
    // An itemKey is honoured only if it belongs to the previous version, so keys cannot be forged to
    // make an unrelated item look like a continuation in the change history.
    const itemKey = item.itemKey && previousKeys.has(item.itemKey) ? item.itemKey : randomUUID();
    return {
      itemKey,
      catalogueItemId: source?.id ?? null,
      name: (item.name ?? source?.name ?? '').trim(),
      description: item.description?.trim() || source?.description || null,
      inScope: item.inScope,
      estimateDays: item.estimateDays ?? source?.defaultDays.toString() ?? '0',
      price: item.price ?? source?.defaultPrice.toString() ?? '0',
    };
  });
  const hostingCycle = input.hostingCycle ?? null;
  const calc = calculateTor({
    setupFee: input.setupFee,
    discountType: input.discountType,
    discountValue: input.discountType === 'NONE' ? '0' : input.discountValue,
    hostingCycle,
    hostingAmount: input.hostingAmount,
    vatTreatment: input.vatTreatment,
    vatRate: VAT_RATE,
    scopeItems,
    addons: input.addons,
  });
  if (!calc.ok) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: CALC_MESSAGES[calc.code],
      details: [{ path: 'commercial', message: CALC_MESSAGES[calc.code] }],
    });
  }
  const hosting = parseMoney(input.hostingAmount) ?? 0n;
  if (hosting > 0n && !hostingCycle) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Choose a billing cycle for the hosting and support plan.',
      details: [{ path: 'hostingCycle', message: 'Choose a billing cycle.' }],
    });
  }
  if (input.discountType !== 'NONE' && (parseMoney(input.discountValue) ?? 0n) === 0n) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Enter the discount value, or choose no discount.',
      details: [{ path: 'discountValue', message: 'Enter a value greater than zero.' }],
    });
  }
  for (const addon of input.addons) {
    if ((parseHundredths(addon.quantity) ?? 0n) === 0n) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: CALC_MESSAGES.INVALID_QUANTITY,
        details: [{ path: 'addons', message: CALC_MESSAGES.INVALID_QUANTITY }],
      });
    }
  }
  return {
    currency: input.currency,
    setupFee: input.setupFee,
    discountType: input.discountType,
    discountValue: input.discountType === 'NONE' ? '0' : input.discountValue,
    hostingName: input.hostingName?.trim() || null,
    hostingDescription: input.hostingDescription?.trim() || null,
    hostingCycle,
    hostingAmount: input.hostingAmount,
    paymentTerms: input.paymentTerms?.trim() || null,
    vatTreatment: input.vatTreatment,
    vatRate: VAT_RATE,
    changeSummary: input.changeSummary?.trim() || null,
    totals: calc.totals,
    scopeItems,
    addons: input.addons.map((a) => ({ ...a, description: a.description.trim() })),
    milestones: input.milestones.map((m) => ({ ...m, name: m.name.trim() })),
  };
}
