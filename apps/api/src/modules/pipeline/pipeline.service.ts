import { Injectable } from '@nestjs/common';
import type { PipelineSummaryDto } from '@autonova/contracts';
import { Currency, LeadStage, enumValues } from '@autonova/enums';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user.js';
import { scopeFor } from '../leads/application/lead-scope.js';
import { nairobiBusinessDate, prismaDateOnly } from '../leads/domain/nairobi-business-date.js';

const OPEN_STAGES = [
  LeadStage.NewLead,
  LeadStage.VisitsAndCalls,
  LeadStage.Qualified,
  LeadStage.ScopeAlignment,
  LeadStage.TorQuoteSent,
] as const;

/**
 * Read-only counts for the dashboard. Every figure is scoped exactly like the lead list (a Director sees
 * all leads, everyone else their own) and comes from a handful of grouped queries, never one per lead.
 */
@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthenticatedUser): Promise<PipelineSummaryDto> {
    const owner = scopeFor(user);
    const own: Prisma.LeadWhereInput = owner ? { ownerUserId: owner } : {};
    const now = new Date();
    const today = prismaDateOnly(nairobiBusinessDate(now));

    const [byStage, overdue, revisitsDue, awaiting, signed, value] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['stage'], where: own, _count: { _all: true } }),
      this.prisma.lead.count({
        where: { ...own, stage: { in: [...OPEN_STAGES] }, nextActionAt: { lt: now } },
      }),
      this.prisma.lead.count({
        where: { ...own, stage: LeadStage.Disqualified, revisitOn: { lte: today } },
      }),
      this.prisma.torVersion.count({ where: { status: 'SENT', tor: { lead: own } } }),
      this.prisma.torVersion.count({ where: { status: 'SIGNED', tor: { lead: own } } }),
      this.prisma.lead.groupBy({
        by: ['currency'],
        where: {
          ...own,
          stage: { in: [LeadStage.Qualified, LeadStage.ScopeAlignment, LeadStage.TorQuoteSent] },
        },
        _sum: { estimatedValue: true },
      }),
    ]);

    const counts = new Map(byStage.map((row) => [row.stage, row._count._all]));
    const count = (stage: LeadStage) => counts.get(stage) ?? 0;
    const currencies: readonly string[] = enumValues(Currency);
    return {
      asOf: now.toISOString(),
      stages: enumValues(LeadStage).map((stage) => ({ stage, count: count(stage) })),
      qualifiedOpportunities: count(LeadStage.Qualified),
      torsAwaitingSignature: awaiting,
      signedDeals: signed,
      won: count(LeadStage.Won),
      lost: count(LeadStage.Lost),
      overdueFollowUps: overdue,
      revisitsDue,
      currency: Currency.KES,
      openValue: value
        .filter((row) => currencies.includes(row.currency))
        .map((row) => ({
          currency: row.currency === 'USD' ? Currency.USD : Currency.KES,
          amount: (row._sum.estimatedValue ?? 0).toString(),
        })),
    };
  }
}
