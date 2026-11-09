import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClientAccountDto, TorVersionDto } from '@autonova/contracts';
import { LeadStage, LeadTransitionSource, SignatureParty } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { NumberSequenceRepository } from '../../settings/infrastructure/number-sequence.repository.js';
import { contentHashOf } from '../domain/tor-content.js';
import { toClientAccountDto } from '../../clients/infrastructure/clients.repository.js';
import { TorsRepository, toVersionDto } from '../infrastructure/tors.repository.js';
import type { SignBody } from '../presentation/tors.schemas.js';
import { TOR_NOT_FOUND } from './tors.use-cases.js';
import { hashableOf } from './tor-snapshot.js';

const NOT_SENT = {
  code: 'TOR_VERSION_NOT_SENT',
  message: 'Only a version that has been sent can be signed. Send the current draft first.',
};
const NOT_LATEST = {
  code: 'TOR_VERSION_SUPERSEDED',
  message: 'That version was replaced by a newer one. Sign the version that is currently open.',
};
const ALREADY_SIGNED_BY_PARTY = {
  code: 'TOR_PARTY_ALREADY_SIGNED',
  message: 'That party has already signed this version.',
};
const VERSION_MISMATCH = {
  code: 'TOR_VERSION_MISMATCH',
  message: 'The version you are signing is not the version currently awaiting signature.',
};
const LEAD_NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
const LEAD_CLOSED = {
  code: 'TOR_LEAD_CLOSED',
  message:
    'This lead is no longer open (it was marked Lost or disqualified), so the agreement cannot be signed. Ask a Director whether to reopen it.',
};

export interface SignResult {
  version: TorVersionDto;
  /** Present once both parties have signed: the account created for this agreement. */
  clientAccount: ClientAccountDto | null;
  /** True when this call is the one that completed the agreement and created the account. */
  converted: boolean;
}

/**
 * Records each party's signature on the exact sent version. When the second signature lands, the SAME
 * transaction locks the version as SIGNED, moves the lead to Won and creates exactly one client account.
 * Nothing else can do this: a quote, a stage change or a repeated call cannot (PRD 4.7). Concurrent and
 * repeated calls are safe: the ToR row is locked, a party can sign a version once, and the account is
 * unique per signed version (and per lead) in the database.
 */
@Injectable()
export class TorSigningUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tors: TorsRepository,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
    private readonly numbers: NumberSequenceRepository,
  ) {}

  async sign(
    leadId: string,
    versionNo: number,
    input: SignBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<SignResult> {
    this.assertMaySign(input.party, user);
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException(LEAD_NOT_FOUND);
    const tor = await this.tors.findByLead(leadId);
    if (!tor) throw new NotFoundException(TOR_NOT_FOUND);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.tors.lock(tx, tor.id);
      // Re-read the lead under the lock: a deal that was marked Lost or disqualified after the ToR was
      // sent must not be won by a late signature. Reopening a Lost deal is an open decision (Q2).
      const current = await this.leads.findForLifecycle(leadId, scopeFor(user), tx);
      if (!current) throw new NotFoundException(LEAD_NOT_FOUND);
      if (current.stage !== LeadStage.ScopeAlignment && current.stage !== LeadStage.TorQuoteSent) {
        throw new ConflictException(LEAD_CLOSED);
      }
      const latest = await this.tors.latestVersion(tor.id, tx);
      if (!latest) throw new NotFoundException(TOR_NOT_FOUND);
      if (latest.versionNo !== versionNo) {
        const asked = await this.tors.versionByNo(tor.id, versionNo, tx);
        if (!asked)
          throw new NotFoundException({
            code: 'TOR_VERSION_NOT_FOUND',
            message: 'That ToR version does not exist',
          });
        throw new ConflictException(asked.status === 'SUPERSEDED' ? NOT_LATEST : VERSION_MISMATCH);
      }
      if (latest.status !== 'SENT') throw new ConflictException(NOT_SENT);

      // The signature binds to the content as it is NOW, recomputed rather than trusted from the row.
      const hash = contentHashOf(hashableOf(tor.number, latest));
      if (hash !== latest.contentHash) {
        throw new ConflictException({
          code: 'TOR_CONTENT_CHANGED',
          message: 'The stored content no longer matches what was sent. Contact an administrator.',
        });
      }
      const existing = await this.tors.signedParties(tx, latest.id);
      if (existing.some((s) => s.party === input.party)) {
        throw new ConflictException(ALREADY_SIGNED_BY_PARTY);
      }
      await this.tors.addSignature(tx, {
        torVersionId: latest.id,
        party: input.party,
        signerName: input.signerName.trim(),
        signerTitle: input.signerTitle?.trim() || null,
        evidenceNote: input.evidenceNote?.trim() || null,
        contentHash: hash,
        recordedByUserId: user.id,
      });
      await this.audit.record(tx, {
        action: 'tor.signed_by_party',
        entityType: 'tor',
        entityId: tor.id,
        actorUserId: user.id,
        // The signer's name is personal data already held on the signature row; the trail keeps the fact.
        // `fingerprint` is the content digest; the audit guard refuses any key that contains "hash".
        newValues: { versionNo: latest.versionNo, party: input.party, fingerprint: hash },
        requestId,
      });

      const both = existing.length === 1 && existing[0]?.party !== input.party;
      if (!both) return { versionId: latest.id, accountId: null as string | null };

      const now = new Date();
      const locked = await this.tors.markSigned(tx, latest.id, now);
      if (locked.count !== 1) throw new ConflictException(NOT_SENT);

      const moved = await this.leads.compareAndSetStage(tx, {
        id: leadId,
        fromStage: current.stage,
        data: { stage: LeadStage.Won },
      });
      if (moved.count !== 1) {
        throw new ConflictException({
          code: 'LEAD_STAGE_CHANGED',
          message: 'The lead changed while you were working. Reload and try again.',
        });
      }
      await this.leads.createHistory(tx, {
        leadId,
        fromStage: current.stage,
        toStage: LeadStage.Won,
        actorUserId: user.id,
        reason: `${tor.number} v${latest.versionNo} signed by both parties`,
        source: LeadTransitionSource.Conversion,
      });

      const goLive = latest.milestones.find((m) => m.kind === 'GO_LIVE');
      const number = await this.numbers.next(tx, 'CL');
      const account = await tx.clientAccount.create({
        data: {
          number,
          leadId,
          torId: tor.id,
          signedTorVersionId: latest.id,
          companyId: lead.companyId,
          name: lead.companyName?.trim() || lead.name,
          goLiveDate: goLive?.targetDate ?? null,
          planName: latest.hostingName,
          billingCycle: latest.hostingCycle,
          planAmount: latest.hostingAmount,
          currency: latest.currency,
          convertedByUserId: user.id,
        },
      });
      await this.audit.record(tx, {
        action: 'client.created',
        entityType: 'client_account',
        entityId: account.id,
        actorUserId: user.id,
        newValues: {
          number,
          leadId,
          torNumber: tor.number,
          signedVersionNo: latest.versionNo,
          fingerprint: hash,
        },
        requestId,
      });
      await this.audit.record(tx, {
        action: 'lead.won',
        entityType: 'lead',
        entityId: leadId,
        actorUserId: user.id,
        oldValues: { stage: current.stage },
        newValues: { stage: LeadStage.Won, signedVersionNo: latest.versionNo },
        reason: `${tor.number} v${latest.versionNo} signed by both parties`,
        requestId,
      });
      return { versionId: latest.id, accountId: account.id };
    });

    const row = await this.tors.versionRow(outcome.versionId);
    if (!row) throw new NotFoundException(TOR_NOT_FOUND);
    const account = outcome.accountId
      ? await this.prisma.clientAccount.findUnique({
          where: { id: outcome.accountId },
          include: { signedVersion: { include: { milestones: { orderBy: { position: 'asc' } } } } },
        })
      : null;
    return {
      version: toVersionDto(row, false),
      clientAccount: account ? toClientAccountDto(account) : null,
      converted: account !== null,
    };
  }

  /** Both parties must be able to sign; a Director is needed only for the Autonova side. */
  assertMaySign(party: SignBody['party'], user: AuthenticatedUser): void {
    if (party === SignatureParty.Autonova && !user.roles.includes('director')) {
      throw new ForbiddenException({
        code: 'TOR_AUTONOVA_SIGNER_MUST_BE_DIRECTOR',
        message:
          'Only a Director can sign for Autonova (decision S5 is still open; Directors are the working default).',
      });
    }
  }
}
