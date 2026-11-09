import { Injectable } from '@nestjs/common';
import type { QualificationDto } from '@autonova/contracts';
import type { QualificationRating } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

type Db = Prisma.TransactionClient;

const select = {
  id: true,
  leadId: true,
  budgetRating: true,
  authorityRating: true,
  needRating: true,
  timelineRating: true,
  score: true,
  passMark: true,
  passed: true,
  notes: true,
  assessedAt: true,
  assessedBy: { select: { fullName: true } },
} as const;

type Row = Prisma.LeadQualificationGetPayload<{ select: typeof select }>;

export const toQualificationDto = (row: Row): QualificationDto => ({
  id: row.id,
  leadId: row.leadId,
  ratings: {
    budget: row.budgetRating as QualificationRating,
    authority: row.authorityRating as QualificationRating,
    need: row.needRating as QualificationRating,
    timeline: row.timelineRating as QualificationRating,
  },
  score: row.score,
  passMark: row.passMark,
  passed: row.passed,
  notes: row.notes,
  assessedByName: row.assessedBy.fullName,
  assessedAt: row.assessedAt.toISOString(),
});

@Injectable()
export class QualificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async latest(leadId: string, db: Db | PrismaService = this.prisma) {
    return db.leadQualification.findFirst({
      where: { leadId },
      orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
      select: { ...select, weights: true },
    });
  }

  async list(leadId: string, page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.prisma.leadQualification.findMany({
        where: { leadId },
        orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select,
      }),
      this.prisma.leadQualification.count({ where: { leadId } }),
    ]);
    return { items: rows.map(toQualificationDto), total, page, pageSize };
  }

  create(
    db: Db,
    input: {
      leadId: string;
      ratings: Record<'budget' | 'authority' | 'need' | 'timeline', QualificationRating>;
      score: number;
      passMark: number;
      weights: Prisma.InputJsonValue;
      passed: boolean;
      notes: string | null;
      assessedByUserId: string;
    },
  ) {
    return db.leadQualification.create({
      data: {
        leadId: input.leadId,
        budgetRating: input.ratings.budget,
        authorityRating: input.ratings.authority,
        needRating: input.ratings.need,
        timelineRating: input.ratings.timeline,
        score: input.score,
        passMark: input.passMark,
        weights: input.weights,
        passed: input.passed,
        notes: input.notes,
        assessedByUserId: input.assessedByUserId,
      },
      select,
    });
  }
}
