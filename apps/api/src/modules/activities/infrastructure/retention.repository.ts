import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

type Db = Prisma.TransactionClient;

export interface DueGps {
  activityId: string;
  leadId: string;
  recordedAt: Date;
  holdReference: string | null;
}

export interface DueVoiceNote {
  attachmentId: string;
  activityId: string;
  leadId: string;
  recordedAt: Date;
  holdReference: string | null;
}

@Injectable()
export class RetentionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Check-ins captured on or before the cutoff and not yet cleared. Read-only. */
  async dueGps(cutoff: Date): Promise<DueGps[]> {
    const rows = await this.prisma.activity.findMany({
      where: { latitude: { not: null }, gpsRecordedAt: { lte: cutoff } },
      select: { id: true, leadId: true, gpsRecordedAt: true, holdReference: true },
      orderBy: [{ gpsRecordedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.flatMap((row) =>
      row.gpsRecordedAt
        ? [
            {
              activityId: row.id,
              leadId: row.leadId,
              recordedAt: row.gpsRecordedAt,
              holdReference: row.holdReference,
            },
          ]
        : [],
    );
  }

  /** Voice notes still stored whose upload is on or before the cutoff. Read-only. */
  async dueVoiceNotes(cutoff: Date): Promise<DueVoiceNote[]> {
    const rows = await this.prisma.activityAttachment.findMany({
      where: { category: 'VOICE_NOTE', purgedAt: null, createdAt: { lte: cutoff } },
      select: {
        id: true,
        activityId: true,
        createdAt: true,
        activity: { select: { leadId: true, holdReference: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      attachmentId: row.id,
      activityId: row.activityId,
      leadId: row.activity.leadId,
      recordedAt: row.createdAt,
      holdReference: row.activity.holdReference,
    }));
  }

  activeDirectorByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        status: 'ACTIVE',
        roles: { some: { role: { key: 'director' } } },
      },
      select: { id: true },
    });
  }

  /** Locks the activity so a hold placed at the same moment is seen by the purge, and the reverse. */
  async lockActivity(db: Db, activityId: string) {
    await db.$executeRaw`SELECT 1 FROM "activities" WHERE "id" = ${activityId}::uuid FOR UPDATE`;
    return db.activity.findUnique({
      where: { id: activityId },
      select: { id: true, leadId: true, holdReference: true, gpsRecordedAt: true, latitude: true },
    });
  }

  /** Compare-and-set: only a still-present check-in is cleared, so a repeat does nothing. */
  clearGps(db: Db, activityId: string, at: Date) {
    return db.activity.updateMany({
      where: { id: activityId, latitude: { not: null } },
      data: {
        latitude: null,
        longitude: null,
        gpsRecordedAt: null,
        gpsClearedAt: at,
      },
    });
  }

  voiceNote(db: Db, activityId: string, attachmentId: string) {
    return db.activityAttachment.findFirst({
      where: { id: attachmentId, activityId, category: 'VOICE_NOTE' },
      select: { id: true, storageKey: true, createdAt: true, archivedAt: true, purgedAt: true },
    });
  }

  /** Marks the file purged (archiving it first when needed). The row, size and hash stay as evidence. */
  markPurged(
    db: Db,
    id: string,
    input: { actorUserId: string; reason: string; reference: string; at: Date },
  ) {
    return db.activityAttachment.updateMany({
      where: { id, purgedAt: null },
      data: {
        purgedAt: input.at,
        purgedByUserId: input.actorUserId,
        purgeReason: input.reason,
        purgeReference: input.reference,
      },
    });
  }

  archiveForPurge(db: Db, id: string, input: { actorUserId: string; reason: string; at: Date }) {
    return db.activityAttachment.updateMany({
      where: { id, archivedAt: null },
      data: {
        archivedAt: input.at,
        archivedByUserId: input.actorUserId,
        archivedReason: input.reason,
      },
    });
  }

  placeHold(
    db: Db,
    id: string,
    input: { reference: string; reason: string; actorUserId: string; at: Date },
  ) {
    return db.activity.updateMany({
      where: { id, holdReference: null },
      data: {
        holdReference: input.reference,
        holdReason: input.reason,
        holdPlacedAt: input.at,
        holdPlacedByUserId: input.actorUserId,
      },
    });
  }

  liftHold(db: Db, id: string) {
    return db.activity.updateMany({
      where: { id, holdReference: { not: null } },
      data: {
        holdReference: null,
        holdReason: null,
        holdPlacedAt: null,
        holdPlacedByUserId: null,
      },
    });
  }
}
