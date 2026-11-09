import { Injectable } from '@nestjs/common';
import type { QuotationDto } from '@autonova/contracts';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import {
  renderCommercialPdf,
  type CommercialDocument,
} from '../../tors/infrastructure/commercial-pdf.js';
import { QuotationsUseCases } from './quotations.use-cases.js';

const CYCLES = { MONTHLY: 'month', QUARTERLY: 'quarter', ANNUAL: 'year' } as const;

function grouped(value: string): string {
  const [whole = '0', fraction] = value.split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? withCommas : `${withCommas}.${fraction}`;
}
const money = (currency: string, value: string) => `${currency} ${grouped(value)}`;

/** Every amount is a stored figure; nothing is recalculated for the document. */
export function quotationDocument(q: QuotationDto, leadName: string): CommercialDocument {
  const cur = q.currency;
  const state = q.expired ? 'Expired' : q.status.charAt(0) + q.status.slice(1).toLowerCase();
  return {
    kindLabel: 'Quotation',
    number: q.number,
    subtitle: leadName,
    reference: [
      {
        label: 'Status',
        value: q.status === 'DRAFT' ? 'Draft (not yet sent to the client)' : state,
      },
      { label: 'Valid until', value: q.validUntil },
      { label: 'Currency', value: cur },
      ...(q.torVersionNo
        ? [{ label: 'Based on', value: `Terms of Reference version ${q.torVersionNo}` }]
        : []),
    ],
    sections: [
      {
        title: 'Items',
        empty: 'No items.',
        rows: q.lines.map((l) => ({
          label: l.description,
          detail: l.quantity === '1.00' ? null : `${l.quantity} × ${money(cur, l.unitPrice)}`,
          right: money(cur, l.lineTotal),
        })),
      },
      {
        title: 'Totals',
        totals: [
          { label: 'One-off subtotal', amount: money(cur, q.totals.oneOffSubtotal) },
          ...(q.discountType !== 'NONE'
            ? [
                {
                  label: `Discount${q.discountType === 'PERCENT' ? ` (${q.discountValue}%)` : ''}`,
                  amount: `- ${money(cur, q.totals.discountAmount)}`,
                },
              ]
            : []),
          { label: 'Net one-off', amount: money(cur, q.totals.netOneOff) },
          {
            label: q.vatTreatment === 'APPLIED' ? `VAT (${q.vatRate}%)` : 'VAT: exempt',
            amount: money(cur, q.totals.vatOneOff),
          },
          { label: 'Total one-off', amount: money(cur, q.totals.totalOneOff), strong: true },
        ],
      },
      ...(q.hostingCycle && q.hostingAmount !== '0.00'
        ? [
            {
              title: 'Recurring plan',
              rows: [
                {
                  label: q.hostingName ?? 'Hosting and support',
                  right: `${money(cur, q.hostingAmount)} / ${CYCLES[q.hostingCycle]}`,
                },
              ],
              totals: [
                {
                  label: q.vatTreatment === 'APPLIED' ? `VAT (${q.vatRate}%)` : 'VAT: exempt',
                  amount: money(cur, q.totals.recurringVat),
                },
                {
                  label: `Total per ${CYCLES[q.hostingCycle]}`,
                  amount: money(cur, q.totals.recurringTotal),
                  strong: true,
                },
              ],
            },
          ]
        : []),
      ...(q.notes ? [{ title: 'Notes', paragraph: q.notes }] : []),
      {
        title: 'About this quotation',
        paragraph:
          'This quotation is an offer. It does not create an agreement: work starts once the Terms of Reference is signed by both parties.',
      },
    ],
    footer: `Autonova  ·  ${q.number}  ·  Generated from saved data`,
  };
}

@Injectable()
export class QuotationPdfUseCase {
  constructor(
    private readonly quotes: QuotationsUseCases,
    private readonly audit: AuditService,
  ) {}

  async render(
    leadId: string,
    id: string,
    leadName: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const quote = await this.quotes.get(leadId, id, user);
    const buffer = await renderCommercialPdf(quotationDocument(quote, leadName));
    await this.audit.recordSecurity({
      action: 'quotation.pdf_generated',
      entityType: 'quotation',
      entityId: id,
      actorUserId: user.id,
    });
    return { buffer, fileName: `${quote.number}.pdf` };
  }
}
