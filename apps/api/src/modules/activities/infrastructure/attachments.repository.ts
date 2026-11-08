import { Injectable } from '@nestjs/common';
import type { ActivityAttachmentDto } from '@autonova/contracts';
import type { AttachmentCategory } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

type Db = Prisma.TransactionClient;

const attachmentSelect = {
  id: true,
  activityId: true,
  category: true,
  fileName: true,
  storageKey: true,
  mimeType: true,
  sizeBytes: true,
  uploadedByUserId: true,
  recordingNoticeGiven: true,
  archivedAt: true,
  purgedAt: true,
  createdAt: true,
  uploadedBy: { select: { fullName: true } },
} as const;

type AttachmentRow = Prisma.ActivityAttachmentGetPayload<{ select: typeof attachmentSelect }>;

/** The storage key is internal: it is never part of the DTO. */
export const toAttachmentDto = (row: AttachmentRow): ActivityAttachmentDto => ({
  id: row.id,
  activityId: row.activityId,
  category: row.category as AttachmentCategory,
  fileName: row.fileName,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  uploadedByName: row.uploadedBy.fullName,
  recordingNoticeGiven: row.recordingNoticeGiven,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForActivity(activityId: string): Promise<ActivityAttachmentDto[]> {
    const rows = await this.prisma.activityAttachment.findMany({
      where: { activityId, archivedAt: null },
      select: attachmentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAttachmentDto);
  }

  /** Both ids must match: an attachment is only found through the activity it belongs to. */
  findInActivity(activityId: string, id: string, db: Db = this.prisma) {
    return db.activityAttachment.findFirst({ where: { id, activityId }, select: attachmentSelect });
  }

  countActive(db: Db, activityId: string) {
    return db.activityAttachment.count({ where: { activityId, archivedAt: null } });
  }

  create(
    db: Db,
    input: {
      id: string;
      activityId: string;
      category: AttachmentCategory;
      fileName: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
      uploadedByUserId: string;
      recordingNoticeGiven: boolean | null;
    },
  ) {
    return db.activityAttachment.create({ data: input, select: attachmentSelect });
  }

  archive(db: Db, id: string, actorUserId: string, reason: string, at: Date) {
    return db.activityAttachment.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: at, archivedByUserId: actorUserId, archivedReason: reason },
    });
  }

  /** Total bytes of the active attachments of one activity (inside the upload transaction). */
  async activeBytes(db: Db, activityId: string): Promise<number> {
    const sum = await db.activityAttachment.aggregate({
      where: { activityId, archivedAt: null },
      _sum: { sizeBytes: true },
    });
    return sum._sum.sizeBytes ?? 0;
  }
}
