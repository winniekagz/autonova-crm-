import type { VersionRow } from '../infrastructure/tors.repository.js';
import { totalsOf } from '../infrastructure/tors.repository.js';
import type { HashableVersion } from '../domain/tor-content.js';

const day = (date: Date) => date.toISOString().slice(0, 10);

/** The agreement content of a persisted version: what a signature binds to and what the PDF prints. */
export function hashableOf(torNumber: string, row: VersionRow): HashableVersion {
  const totals = totalsOf(row);
  return {
    torNumber,
    versionNo: row.versionNo,
    currency: row.currency,
    setupFee: row.setupFee.toString(),
    discountType: row.discountType,
    discountValue: row.discountValue.toString(),
    hostingName: row.hostingName,
    hostingDescription: row.hostingDescription,
    hostingCycle: row.hostingCycle,
    hostingAmount: row.hostingAmount.toString(),
    paymentTerms: row.paymentTerms,
    vatTreatment: row.vatTreatment,
    vatRate: row.vatRate.toString(),
    scopeItems: row.scopeItems.map((i) => ({
      itemKey: i.itemKey,
      name: i.name,
      description: i.description,
      inScope: i.inScope,
      estimateDays: i.estimateDays.toString(),
      price: i.price.toString(),
    })),
    addons: row.addons.map((a) => ({
      kind: a.kind,
      description: a.description,
      quantity: a.quantity.toString(),
      unitPrice: a.unitPrice.toString(),
    })),
    milestones: row.milestones.map((m) => ({
      kind: m.kind,
      name: m.name,
      targetDate: day(m.targetDate),
    })),
    totals: {
      oneOffSubtotal: totals.oneOffSubtotal,
      discountAmount: totals.discountAmount,
      netOneOff: totals.netOneOff,
      vatOneOff: totals.vatOneOff,
      totalOneOff: totals.totalOneOff,
      recurringVat: totals.recurringVat,
      recurringTotal: totals.recurringTotal,
    },
  };
}
