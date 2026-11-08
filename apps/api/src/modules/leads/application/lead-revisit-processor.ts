import { Injectable, Logger } from '@nestjs/common';
import { LeadDisqualificationReason, LeadStage, LeadTransitionSource } from '@autonova/enums';
import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { nairobiBusinessDate, prismaDateOnly } from '../domain/nairobi-business-date.js';
import { LeadsRepository } from '../infrastructure/leads.repository.js';

export interface RevisitProcessingResult {
  businessDate: string;
  scanned: number;
  reentered: number;
  failed: number;
}

/**
 * Idempotent, one-shot worker. A deployment scheduler invokes the CLI on a recurring schedule.
 * The due work lives in `leads.revisit_on`, so downtime is recovered by the next invocation.
 */
@Injectable()
export class LeadRevisitProcessor {
  private readonly logger = new Logger(LeadRevisitProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
  ) {}

  async processDue(at = new Date(), batchSize = 100): Promise<RevisitProcessingResult> {
    const businessDate = nairobiBusinessDate(at);
    const cutoff = prismaDateOnly(businessDate);
    const due = await this.leads.dueRevisits(cutoff, batchSize);
    let reentered = 0;
    let failed = 0;

    for (const lead of due) {
      if (!lead.revisitOn) continue;
      try {
        const changed = await this.prisma.$transaction(async (tx) => {
          const update = await this.leads.compareAndSetStage(tx, {
            id: lead.id,
            fromStage: LeadStage.Disqualified,
            revisitOn: lead.revisitOn,
            data: { stage: LeadStage.NewLead },
          });
          if (update.count !== 1) return false;

          await this.leads.createHistory(tx, {
            leadId: lead.id,
            fromStage: LeadStage.Disqualified,
            toStage: LeadStage.NewLead,
            actorUserId: null,
            disqualificationReason: LeadDisqualificationReason.TimingRevisitLater,
            revisitOn: lead.revisitOn,
            source: LeadTransitionSource.ScheduledRevisit,
          });
          await this.audit.record(tx, {
            action: 'lead.revisit_reentered',
            entityType: 'lead',
            entityId: lead.id,
            actorUserId: null,
            oldValues: { stage: LeadStage.Disqualified },
            newValues: { stage: LeadStage.NewLead, revisitOn: businessDate },
            reason: 'Scheduled revisit date reached',
          });
          return true;
        });
        if (changed) reentered += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(
          { err: error, leadId: lead.id, revisitOn: lead.revisitOn.toISOString() },
          'Failed to process due lead revisit; the next scheduler run will retry it',
        );
      }
    }

    const result = { businessDate, scanned: due.length, reentered, failed };
    this.logger.log(result, 'Lead revisit processing finished');
    return result;
  }
}
