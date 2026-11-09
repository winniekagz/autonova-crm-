import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Paginated, QuotationDto } from '@autonova/contracts';
import { QuotationStatus } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { nairobiBusinessDate } from '../../leads/domain/nairobi-business-date.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { SettingsService } from '../../settings/application/settings.service.js';
import { NumberSequenceRepository } from '../../settings/infrastructure/number-sequence.repository.js';
import { formatMoney, lineTotal, parseHundredths, parseMoney } from '../../tors/domain/money.js';
import { calculateTor } from '../../tors/domain/tor-calculator.js';
import { TorsRepository } from '../../tors/infrastructure/tors.repository.js';
import {
  addDays,
  canMoveQuotation,
  checkSendable,
  isPastValidity,
  type SendProblem,
} from '../domain/quotation-rules.js';
import {
  QuotationsRepository,
  toQuotationDto,
  type QuotationWrite,
} from '../infrastructure/quotations.repository.js';
import type {
  FromTorBody,
  QuickQuoteBody,
  QuotationStatusBody,
} from '../presentation/quotations.schemas.js';

const LEAD_NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
const QUOTE_NOT_FOUND = { code: 'QUOTATION_NOT_FOUND', message: 'Quotation not found' };
const NO_TOR = {
  code: 'QUOTATION_NO_TOR',
  message: 'Create the Terms of Reference first, or use a quick quote for a simple deal.',
};
const TOR_DRAFT_ONLY = {
  code: 'QUOTATION_TOR_NOT_SENT',
  message:
    'A quotation is built from a ToR version that has been sent. Send the current ToR version first.',
};
const SEND_MESSAGES: Record<SendProblem, string> = {
  NO_LINES: 'Add at least one line before sending the quotation.',
  ALREADY_PAST: 'The validity date has already passed. Create a new quotation with a later date.',
};
const BAD_DATE = {
  code: 'VALIDATION_FAILED',
  message: 'The validity date must be today or later.',
  details: [{ path: 'validUntil', message: 'Choose today or a later date.' }],
};

@Injectable()
export class QuotationsUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotationsRepository,
    private readonly tors: TorsRepository,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly numbers: NumberSequenceRepository,
  ) {}

  private today = () => nairobiBusinessDate(new Date());

  private async requireLead(leadId: string, user: AuthenticatedUser) {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException(LEAD_NOT_FOUND);
    return lead;
  }

  async requireQuote(leadId: string, id: string, user: AuthenticatedUser) {
    await this.requireLead(leadId, user);
    const row = await this.quotes.row(id);
    // The quote is found only through its own lead: a wrong lead and an unknown id answer alike.
    if (!row || row.leadId !== leadId) throw new NotFoundException(QUOTE_NOT_FOUND);
    return row;
  }

  async list(
    leadId: string,
    page: number,
    pageSize: number,
    user: AuthenticatedUser,
  ): Promise<Paginated<QuotationDto>> {
    await this.requireLead(leadId, user);
    const { rows, total } = await this.quotes.listForLead(leadId, page, pageSize);
    const today = this.today();
    return { items: rows.map((r) => toQuotationDto(r, today)), total, page, pageSize };
  }

  async get(leadId: string, id: string, user: AuthenticatedUser): Promise<QuotationDto> {
    return toQuotationDto(await this.requireQuote(leadId, id, user), this.today());
  }

  private async validity(requested: string | undefined): Promise<string> {
    const today = this.today();
    const validUntil = requested ?? addDays(today, await this.settings.quoteValidityDays());
    if (isPastValidity(validUntil, today)) throw new BadRequestException(BAD_DATE);
    return validUntil;
  }

  /**
   * Builds a quote from the lead's LATEST ToR version, copying its persisted figures (never recalculating
   * from the catalogue). The quote keeps the id of the exact version it came from. The version must have
   * been sent: a draft is still being negotiated and may change.
   */
  async fromTor(
    leadId: string,
    input: FromTorBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<QuotationDto> {
    await this.requireLead(leadId, user);
    const tor = await this.tors.findByLead(leadId);
    if (!tor) throw new ConflictException(NO_TOR);
    const validUntil = await this.validity(input.validUntil);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      const version = await this.tors.latestVersion(tor.id, tx);
      if (!version) throw new ConflictException(NO_TOR);
      if (version.status === 'DRAFT') throw new ConflictException(TOR_DRAFT_ONLY);
      const number = await this.numbers.next(tx, 'QT');
      const lines: QuotationWrite['lines'] = [
        ...(parseMoney(version.setupFee.toString())
          ? [
              {
                kind: 'CUSTOM' as const,
                description: 'Setup and development fee',
                quantity: '1',
                unitPrice: version.setupFee.toString(),
                lineTotal: version.setupFee.toString(),
              },
            ]
          : []),
        ...version.scopeItems
          .filter((i) => i.inScope && (parseMoney(i.price.toString()) ?? 0n) > 0n)
          .map((i) => ({
            kind: 'SCOPE' as const,
            description: i.name,
            quantity: '1',
            unitPrice: i.price.toString(),
            lineTotal: i.price.toString(),
          })),
        ...version.addons.map((a) => ({
          kind: 'ADDON' as const,
          description: a.description,
          quantity: a.quantity.toString(),
          unitPrice: a.unitPrice.toString(),
          lineTotal: formatMoney(
            lineTotal(
              parseHundredths(a.quantity.toString()) ?? 0n,
              parseMoney(a.unitPrice.toString()) ?? 0n,
            ),
          ),
        })),
      ];
      const created = await this.quotes.create(tx, {
        number,
        leadId,
        kind: 'FROM_TOR',
        torVersionId: version.id,
        currency: version.currency,
        validUntil,
        vatTreatment: version.vatTreatment,
        vatRate: version.vatRate.toString(),
        discountType: version.discountType,
        discountValue: version.discountValue.toString(),
        hostingName: version.hostingName,
        hostingCycle: version.hostingCycle,
        hostingAmount: version.hostingAmount.toString(),
        oneOffSubtotal: version.oneOffSubtotal.toString(),
        discountAmount: version.discountAmount.toString(),
        netOneOff: version.netOneOff.toString(),
        vatOneOff: version.vatOneOff.toString(),
        totalOneOff: version.totalOneOff.toString(),
        recurringVat: version.recurringVat.toString(),
        recurringTotal: version.recurringTotal.toString(),
        notes: input.notes?.trim() || null,
        createdByUserId: user.id,
        lines,
      });
      await this.audit.record(tx, {
        action: 'quotation.created',
        entityType: 'quotation',
        entityId: created,
        actorUserId: user.id,
        newValues: {
          number,
          leadId,
          kind: 'FROM_TOR',
          torNumber: tor.number,
          torVersionNo: version.versionNo,
          totalOneOff: version.totalOneOff.toString(),
        },
        requestId,
      });
      return created;
    });
    return this.get(leadId, id, user);
  }

  /** A standalone quote for a simple deal: priced lines only, same server-side arithmetic as a ToR. */
  async quick(
    leadId: string,
    input: QuickQuoteBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<QuotationDto> {
    await this.requireLead(leadId, user);
    const validUntil = await this.validity(input.validUntil);
    const hostingCycle = input.hostingCycle ?? null;
    const lines = input.lines.map((l) => {
      const quantity = parseHundredths(l.quantity);
      const unit = parseMoney(l.unitPrice);
      if (quantity === null || quantity === 0n || unit === null) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Every line needs a quantity above zero and a valid price.',
          details: [{ path: 'lines', message: 'Check the quantity and price of each line.' }],
        });
      }
      return {
        kind: 'CUSTOM' as const,
        description: l.description.trim(),
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: formatMoney(lineTotal(quantity, unit)),
      };
    });
    const calc = calculateTor({
      setupFee: '0',
      discountType: input.discountType,
      discountValue: input.discountType === 'NONE' ? '0' : input.discountValue,
      hostingCycle,
      hostingAmount: input.hostingAmount,
      vatTreatment: input.vatTreatment,
      vatRate: '16.00',
      scopeItems: [],
      addons: input.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    });
    if (!calc.ok) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'The amounts do not add up: check the discount and the prices.',
        details: [{ path: 'commercial', message: calc.code }],
      });
    }
    if ((parseMoney(input.hostingAmount) ?? 0n) > 0n && !hostingCycle) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Choose a billing cycle for the recurring plan.',
        details: [{ path: 'hostingCycle', message: 'Choose a billing cycle.' }],
      });
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next(tx, 'QT');
      const created = await this.quotes.create(tx, {
        number,
        leadId,
        kind: 'QUICK',
        torVersionId: null,
        currency: input.currency,
        validUntil,
        vatTreatment: input.vatTreatment,
        vatRate: '16.00',
        discountType: input.discountType,
        discountValue: input.discountType === 'NONE' ? '0' : input.discountValue,
        hostingName: input.hostingName?.trim() || null,
        hostingCycle,
        hostingAmount: input.hostingAmount,
        oneOffSubtotal: calc.totals.oneOffSubtotal,
        discountAmount: calc.totals.discountAmount,
        netOneOff: calc.totals.netOneOff,
        vatOneOff: calc.totals.vatOneOff,
        totalOneOff: calc.totals.totalOneOff,
        recurringVat: calc.totals.recurringVat,
        recurringTotal: calc.totals.recurringTotal,
        notes: input.notes?.trim() || null,
        createdByUserId: user.id,
        lines,
      });
      await this.audit.record(tx, {
        action: 'quotation.created',
        entityType: 'quotation',
        entityId: created,
        actorUserId: user.id,
        newValues: { number, leadId, kind: 'QUICK', totalOneOff: calc.totals.totalOneOff },
        requestId,
      });
      return created;
    });
    return this.get(leadId, id, user);
  }

  /**
   * Moves a quote through its lifecycle. NOTHING here changes the lead or the ToR: accepting a quote is not
   * conversion, which needs both parties' signatures on one ToR version (SOW 4.7).
   */
  async setStatus(
    leadId: string,
    id: string,
    input: QuotationStatusBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<QuotationDto> {
    const current = await this.requireQuote(leadId, id, user);
    const from = current.status as QuotationStatus;
    const to = input.status;
    if (!canMoveQuotation(from, to) || to === QuotationStatus.Expired) {
      throw new ConflictException({
        code: 'QUOTATION_INVALID_TRANSITION',
        message: `A ${from.toLowerCase()} quotation cannot become ${to.toLowerCase()}.`,
      });
    }
    const today = this.today();
    if (to === QuotationStatus.Sent) {
      const problem = checkSendable({
        validUntil: current.validUntil.toISOString().slice(0, 10),
        today,
        lineCount: current.lines.length,
      });
      if (problem) {
        throw new ConflictException({
          code: `QUOTATION_${problem}`,
          message: SEND_MESSAGES[problem],
        });
      }
    }
    if (
      to === QuotationStatus.Accepted &&
      isPastValidity(current.validUntil.toISOString().slice(0, 10), today)
    ) {
      throw new ConflictException({
        code: 'QUOTATION_EXPIRED',
        message: 'This quotation has passed its validity date and can no longer be accepted.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.quotes.move(tx, id, from, to, new Date());
      if (changed.count !== 1) {
        throw new ConflictException({
          code: 'QUOTATION_CHANGED',
          message: 'The quotation changed while you were working. Reload and try again.',
        });
      }
      await this.audit.record(tx, {
        action: `quotation.${to.toLowerCase()}`,
        entityType: 'quotation',
        entityId: id,
        actorUserId: user.id,
        oldValues: { status: from },
        newValues: { status: to },
        requestId,
      });
    });
    return this.get(leadId, id, user);
  }

  /**
   * Marks open quotes past their validity date as EXPIRED, in a bounded batch. Safe to run repeatedly (a
   * quote is only moved from SENT). There is no scheduler yet: run it from an operator command or cron
   * (documented), and until then the API reports `expired` on read so a stale quote is never shown as valid.
   */
  async expireDue(limit = 200): Promise<number> {
    const due = await this.quotes.expiredOpen(this.today(), limit);
    let expired = 0;
    for (const quote of due) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const moved = await this.quotes.move(
          tx,
          quote.id,
          QuotationStatus.Sent,
          QuotationStatus.Expired,
          new Date(),
        );
        if (moved.count === 1) {
          await this.audit.record(tx, {
            action: 'quotation.expired',
            entityType: 'quotation',
            entityId: quote.id,
            actorUserId: null,
            oldValues: { status: 'SENT' },
            newValues: { status: 'EXPIRED' },
          });
        }
        return moved.count;
      });
      expired += changed;
    }
    return expired;
  }
}
