import type { TorChangeDto, TorVersionDiffDto } from '@autonova/contracts';

interface DiffableItem {
  itemKey: string;
  name: string;
  inScope: boolean;
  estimateDays: string;
  price: string;
}

interface DiffableVersion {
  versionNo: number;
  currency: string;
  setupFee: string;
  discountType: string;
  discountValue: string;
  hostingAmount: string;
  hostingCycle: string | null;
  paymentTerms: string | null;
  vatTreatment: string;
  scopeItems: readonly DiffableItem[];
  addons: readonly unknown[];
  milestones: readonly unknown[];
}

/**
 * What changed between two versions, by stable item key. Dropped items are listed as REMOVED so a dropped
 * request stays part of the record (PRD 4.5) even though the newer version no longer holds it.
 */
export function diffVersions(from: DiffableVersion, to: DiffableVersion): TorVersionDiffDto {
  const scope: TorChangeDto[] = [];
  const before = new Map(from.scopeItems.map((i) => [i.itemKey, i]));
  const after = new Map(to.scopeItems.map((i) => [i.itemKey, i]));
  for (const item of to.scopeItems) {
    const old = before.get(item.itemKey);
    if (!old) {
      scope.push({
        kind: 'ADDED',
        itemName: item.name,
        detail: item.inScope ? 'In scope' : 'Out of scope',
      });
      continue;
    }
    if (old.inScope !== item.inScope) {
      scope.push({
        kind: 'SCOPE_FLIPPED',
        itemName: item.name,
        detail: item.inScope ? 'Out of scope to in scope' : 'In scope to out of scope',
      });
    }
    const changes: string[] = [];
    if (old.name !== item.name) changes.push(`name "${old.name}" to "${item.name}"`);
    if (old.estimateDays !== item.estimateDays) {
      changes.push(`estimate ${old.estimateDays} to ${item.estimateDays} days`);
    }
    if (old.price !== item.price) changes.push(`price ${old.price} to ${item.price}`);
    if (changes.length > 0)
      scope.push({ kind: 'CHANGED', itemName: item.name, detail: changes.join('; ') });
  }
  for (const item of from.scopeItems) {
    if (!after.has(item.itemKey)) {
      scope.push({ kind: 'REMOVED', itemName: item.name, detail: 'Dropped in this round' });
    }
  }

  const commercial: string[] = [];
  const line = (label: string, a: string | null, b: string | null) => {
    if (a !== b) commercial.push(`${label}: ${a ?? 'none'} to ${b ?? 'none'}`);
  };
  line('Currency', from.currency, to.currency);
  line('Setup fee', from.setupFee, to.setupFee);
  line(
    'Discount',
    `${from.discountType} ${from.discountValue}`,
    `${to.discountType} ${to.discountValue}`,
  );
  line('Hosting and support amount', from.hostingAmount, to.hostingAmount);
  line('Billing cycle', from.hostingCycle, to.hostingCycle);
  line('Payment terms', from.paymentTerms, to.paymentTerms);
  line('VAT', from.vatTreatment, to.vatTreatment);
  line('Add-ons', String(from.addons.length), String(to.addons.length));
  line('Milestones', String(from.milestones.length), String(to.milestones.length));

  return { fromVersionNo: from.versionNo, toVersionNo: to.versionNo, scope, commercial };
}
