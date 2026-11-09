import { createHash } from 'node:crypto';

/**
 * The content that a signature binds to. Built only from what the version holds, in a fixed order and key
 * order, so the same version always hashes the same and any change to scope, price, terms or milestones
 * changes the hash. Ids, timestamps and who edited are not part of the agreement.
 */
export interface HashableVersion {
  torNumber: string;
  versionNo: number;
  currency: string;
  setupFee: string;
  discountType: string;
  discountValue: string;
  hostingName: string | null;
  hostingDescription: string | null;
  hostingCycle: string | null;
  hostingAmount: string;
  paymentTerms: string | null;
  vatTreatment: string;
  vatRate: string;
  scopeItems: readonly {
    itemKey: string;
    name: string;
    description: string | null;
    inScope: boolean;
    estimateDays: string;
    price: string;
  }[];
  addons: readonly { kind: string; description: string; quantity: string; unitPrice: string }[];
  milestones: readonly { kind: string; name: string; targetDate: string }[];
  totals: {
    oneOffSubtotal: string;
    discountAmount: string;
    netOneOff: string;
    vatOneOff: string;
    totalOneOff: string;
    recurringVat: string;
    recurringTotal: string;
  };
}

export function contentHashOf(version: HashableVersion): string {
  const canonical = JSON.stringify({
    torNumber: version.torNumber,
    versionNo: version.versionNo,
    currency: version.currency,
    setupFee: version.setupFee,
    discount: [version.discountType, version.discountValue],
    hosting: [
      version.hostingName,
      version.hostingDescription,
      version.hostingCycle,
      version.hostingAmount,
    ],
    paymentTerms: version.paymentTerms,
    vat: [version.vatTreatment, version.vatRate],
    scope: version.scopeItems.map((i) => [
      i.itemKey,
      i.name,
      i.description,
      i.inScope,
      i.estimateDays,
      i.price,
    ]),
    addons: version.addons.map((a) => [a.kind, a.description, a.quantity, a.unitPrice]),
    milestones: version.milestones.map((m) => [m.kind, m.name, m.targetDate]),
    totals: [
      version.totals.oneOffSubtotal,
      version.totals.discountAmount,
      version.totals.netOneOff,
      version.totals.vatOneOff,
      version.totals.totalOneOff,
      version.totals.recurringVat,
      version.totals.recurringTotal,
    ],
  });
  return createHash('sha256').update(canonical).digest('hex');
}
