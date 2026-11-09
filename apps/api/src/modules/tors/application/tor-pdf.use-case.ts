import { Injectable, NotFoundException } from '@nestjs/common';
import type { TorVersionDto } from '@autonova/contracts';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { formatHundredths, parseHundredths, sum } from '../domain/money.js';
import { renderCommercialPdf, type CommercialDocument } from '../infrastructure/commercial-pdf.js';
import { TorsRepository, toVersionDto } from '../infrastructure/tors.repository.js';
import { TOR_NOT_FOUND } from './tors.use-cases.js';

const money = (currency: string, value: string) => `${currency} ${formatGrouped(value)}`;

/** Groups the whole part with commas for display; the decimal string itself is never parsed as a float. */
function formatGrouped(value: string): string {
  const [whole = '0', fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

const CYCLES = { MONTHLY: 'month', QUARTERLY: 'quarter', ANNUAL: 'year' } as const;
const STATUS_LABEL = {
  DRAFT: 'DRAFT (not yet sent: not an agreement)',
  SENT: 'Sent for signature',
  SIGNED: 'Signed',
  SUPERSEDED: 'Superseded by a newer version',
} as const;

export function torDocument(
  number: string,
  leadName: string,
  company: string | null,
  v: TorVersionDto,
): CommercialDocument {
  const cur = v.currency;
  const inScope = v.scopeItems.filter((i) => i.inScope);
  const out = v.scopeItems.filter((i) => !i.inScope);
  const totalDays = formatHundredths(
    sum(inScope.map((i) => parseHundredths(i.estimateDays) ?? 0n)),
  );
  return {
    kindLabel: 'Terms of Reference',
    number: `${number}  ·  Version ${v.versionNo}`,
    subtitle: company ? `${company}: ${leadName}` : leadName,
    reference: [
      { label: 'Status', value: STATUS_LABEL[v.status] },
      { label: 'Currency', value: cur },
      ...(v.sentAt ? [{ label: 'Sent', value: v.sentAt.slice(0, 10) }] : []),
      ...(v.signedAt ? [{ label: 'Signed', value: v.signedAt.slice(0, 10) }] : []),
      ...(v.contentHash
        ? [{ label: 'Content hash', value: v.contentHash.slice(0, 16) + '…' }]
        : []),
    ],
    sections: [
      {
        title: 'In scope',
        empty: 'Nothing is in scope yet.',
        rows: inScope.map((i) => ({
          label: i.name,
          detail: [i.description, `${i.estimateDays} estimated days`].filter(Boolean).join('  ·  '),
          right: money(cur, i.price),
        })),
      },
      {
        title: 'Out of scope (not included)',
        empty: 'Nothing was recorded as out of scope.',
        rows: out.map((i) => ({ label: i.name, detail: i.description })),
      },
      {
        title: 'Commercials',
        totals: [
          { label: `Setup and development fee`, amount: money(cur, v.setupFee) },
          {
            label: `Scope items (${totalDays} estimated days)`,
            amount: money(cur, v.totals.scopeTotal),
          },
          ...(v.addons.length > 0
            ? [{ label: 'Add-ons', amount: money(cur, v.totals.addonsTotal) }]
            : []),
          { label: 'One-off subtotal', amount: money(cur, v.totals.oneOffSubtotal) },
          ...(v.discountType !== 'NONE'
            ? [
                {
                  label: `Discount${v.discountType === 'PERCENT' ? ` (${v.discountValue}%)` : ''}`,
                  amount: `- ${money(cur, v.totals.discountAmount)}`,
                },
              ]
            : []),
          { label: 'Net one-off', amount: money(cur, v.totals.netOneOff) },
          {
            label: v.vatTreatment === 'APPLIED' ? `VAT (${v.vatRate}%)` : 'VAT: exempt',
            amount: money(cur, v.totals.vatOneOff),
          },
          { label: 'Total one-off', amount: money(cur, v.totals.totalOneOff), strong: true },
        ],
      },
      ...(v.addons.length > 0
        ? [
            {
              title: 'Add-ons',
              rows: v.addons.map((a) => ({
                label: a.description,
                detail: `${a.quantity} × ${money(cur, a.unitPrice)}`,
                right: money(cur, a.lineTotal),
              })),
            },
          ]
        : []),
      {
        title: 'Hosting and support plan',
        empty: 'No recurring plan is part of this agreement.',
        ...(v.hostingCycle && v.hostingAmount !== '0.00'
          ? {
              rows: [
                {
                  label: v.hostingName ?? 'Hosting and support',
                  detail: v.hostingDescription,
                  right: `${money(cur, v.hostingAmount)} / ${CYCLES[v.hostingCycle]}`,
                },
              ],
              totals: [
                {
                  label:
                    v.vatTreatment === 'APPLIED'
                      ? `VAT (${v.vatRate}%) per ${CYCLES[v.hostingCycle]}`
                      : 'VAT: exempt',
                  amount: money(cur, v.totals.recurringVat),
                },
                {
                  label: `Total per ${CYCLES[v.hostingCycle]}`,
                  amount: money(cur, v.totals.recurringTotal),
                  strong: true,
                },
              ],
            }
          : {}),
      },
      {
        title: 'Payment terms',
        paragraph: v.paymentTerms ?? 'Payment terms have not been recorded.',
      },
      {
        title: 'Delivery milestones',
        empty: 'No milestones have been set.',
        rows: v.milestones.map((m) => ({ label: m.name, right: m.targetDate })),
      },
      ...(v.changeSummary
        ? [{ title: 'What changed in this version', paragraph: v.changeSummary }]
        : []),
      {
        title: 'Signatures',
        empty:
          v.status === 'DRAFT'
            ? 'This draft has not been sent for signature.'
            : 'No party has signed yet.',
        rows: v.signatures.map((s) => ({
          label: `${s.party === 'CLIENT' ? 'Client' : 'Autonova'}: ${s.signerName}${s.signerTitle ? `, ${s.signerTitle}` : ''}`,
          detail: s.evidenceNote,
          right: s.signedAt.slice(0, 10),
        })),
      },
    ],
    footer: `Autonova  ·  ${number} v${v.versionNo}  ·  Generated from saved data`,
  };
}

@Injectable()
export class TorPdfUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tors: TorsRepository,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Renders a stored version (any status). Reads persisted rows only; nothing is recalculated. */
  async render(
    leadId: string,
    versionNo: number,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead not found' });
    const tor = await this.tors.findByLead(leadId);
    if (!tor) throw new NotFoundException(TOR_NOT_FOUND);
    const row = await this.tors.versionByNo(tor.id, versionNo);
    if (!row)
      throw new NotFoundException({
        code: 'TOR_VERSION_NOT_FOUND',
        message: 'That ToR version does not exist',
      });
    const buffer = await renderCommercialPdf(
      torDocument(tor.number, lead.name, lead.companyName, toVersionDto(row, false)),
    );
    await this.audit.recordSecurity({
      action: 'tor.pdf_generated',
      entityType: 'tor',
      entityId: tor.id,
      actorUserId: user.id,
      newValues: { versionNo, status: row.status },
    });
    return { buffer, fileName: `${tor.number}-v${versionNo}.pdf` };
  }
}
