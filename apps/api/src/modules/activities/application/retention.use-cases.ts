import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ActivityDto,
  RetentionCandidateDto,
  RetentionOutcomeDto,
  RetentionReviewDto,
} from '@autonova/contracts';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { FILE_STORAGE, type FileStorage } from '../../storage/file-storage.js';
import {
  ageInMonths,
  isPastRetention,
  retentionCutoff,
  type RetentionPolicy,
} from '../domain/retention.js';
import { RetentionRepository } from '../infrastructure/retention.repository.js';
import type {
  PlaceHoldBody,
  RemoveAttachmentBody,
  RetentionApprovalBody,
} from '../presentation/activities.schemas.js';
import { ACTIVITY_NOT_FOUND, ActivitiesUseCases } from './activities.use-cases.js';

const HOLD_EXISTS = {
  code: 'ACTIVITY_HOLD_EXISTS',
  message: 'This report is already under a hold. Lift it before placing a new one.',
};
const NO_HOLD = { code: 'ACTIVITY_NOT_HELD', message: 'This report is not under a hold.' };

type Item = RetentionApprovalBody['items'][number];

/**
 * Retention is a reviewed, approved action and never a background job (decision 2026-11-08): `review` only
 * lists what is past its period; `purge` acts on an explicit list a Director approved, with a reference
 * and reason, skipping anything under a hold. Rows, sizes and hashes stay as evidence; only the stored
 * bytes and the coordinates go. Audit entries record what was removed, never its content.
 */
@Injectable()
export class RetentionUseCases {
  private readonly logger = new Logger(RetentionUseCases.name);
  private readonly policy: RetentionPolicy;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly retention: RetentionRepository,
    private readonly activityRules: ActivitiesUseCases,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {
    this.policy = {
      gpsMonths: config.get('RETENTION_GPS_MONTHS', { infer: true }),
      voiceNoteMonths: config.get('RETENTION_VOICE_NOTE_MONTHS', { infer: true }),
    };
  }

  async review(now: Date = new Date()): Promise<RetentionReviewDto> {
    const [gps, voice] = await Promise.all([
      this.retention.dueGps(retentionCutoff(now, this.policy.gpsMonths)),
      this.retention.dueVoiceNotes(retentionCutoff(now, this.policy.voiceNoteMonths)),
    ]);
    const candidates: RetentionCandidateDto[] = [
      ...gps.map((row) => ({
        kind: 'GPS' as const,
        activityId: row.activityId,
        leadId: row.leadId,
        attachmentId: null,
        recordedAt: row.recordedAt.toISOString(),
        ageMonths: ageInMonths(row.recordedAt, now),
        held: row.holdReference !== null,
        holdReference: row.holdReference,
      })),
      ...voice.map((row) => ({
        kind: 'VOICE_NOTE' as const,
        activityId: row.activityId,
        leadId: row.leadId,
        attachmentId: row.attachmentId,
        recordedAt: row.recordedAt.toISOString(),
        ageMonths: ageInMonths(row.recordedAt, now),
        held: row.holdReference !== null,
        holdReference: row.holdReference,
      })),
    ];
    return {
      asOf: now.toISOString(),
      gpsMonths: this.policy.gpsMonths,
      voiceNoteMonths: this.policy.voiceNoteMonths,
      candidates,
    };
  }

  /** Acts only on the approved items. Each is its own transaction, so one failure never undoes the rest. */
  async purge(
    approval: RetentionApprovalBody,
    approver: { id: string },
    requestId?: string,
    now: Date = new Date(),
  ): Promise<RetentionOutcomeDto> {
    const outcome: RetentionOutcomeDto = { purged: 0, skippedHeld: 0, skippedNotDue: 0, failed: 0 };
    for (const item of approval.items) {
      try {
        const result = await this.purgeOne(item, approval, approver, requestId, now);
        if (result === 'purged') outcome.purged += 1;
        else if (result === 'held') outcome.skippedHeld += 1;
        else outcome.skippedNotDue += 1;
      } catch (error) {
        outcome.failed += 1;
        this.logger.error(
          { err: error, kind: item.kind, activityId: item.activityId },
          'Retention purge failed for an item',
        );
      }
    }
    return outcome;
  }

  /** The approver of a command-line purge must be an active Director, found by email; null otherwise. */
  async activeDirectorByEmail(email: string): Promise<{ id: string } | null> {
    return this.retention.activeDirectorByEmail(email);
  }

  async placeHold(
    leadId: string,
    id: string,
    input: PlaceHoldBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    await this.activityRules.requireLead(leadId, user);
    await this.requireActivity(leadId, id);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.retention.placeHold(tx, id, {
        ...input,
        actorUserId: user.id,
        at: new Date(),
      });
      if (changed.count !== 1) throw new ConflictException(HOLD_EXISTS);
      await this.audit.record(tx, {
        action: 'activity.hold_placed',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        newValues: { holdReference: input.reference },
        reason: input.reason,
        requestId,
      });
    });
    return this.activityRules.get(leadId, id, user);
  }

  async liftHold(
    leadId: string,
    id: string,
    input: RemoveAttachmentBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    await this.activityRules.requireLead(leadId, user);
    const row = await this.requireActivity(leadId, id);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.retention.liftHold(tx, id);
      if (changed.count !== 1) throw new ConflictException(NO_HOLD);
      await this.audit.record(tx, {
        action: 'activity.hold_lifted',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        oldValues: { holdReference: row.holdReference },
        reason: input.reason,
        requestId,
      });
    });
    return this.activityRules.get(leadId, id, user);
  }

  private async requireActivity(leadId: string, id: string) {
    const row = await this.activityRules.findOne(leadId, id);
    if (!row) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    return row;
  }

  private purgeOne(
    item: Item,
    approval: RetentionApprovalBody,
    approver: { id: string },
    requestId: string | undefined,
    now: Date,
  ): Promise<'purged' | 'held' | 'notDue'> {
    return this.prisma.$transaction(async (tx) => {
      const activity = await this.retention.lockActivity(tx, item.activityId);
      if (!activity) throw new NotFoundException(ACTIVITY_NOT_FOUND);
      if (activity.holdReference !== null) return 'held';
      if (item.kind === 'GPS') {
        if (activity.latitude === null || activity.gpsRecordedAt === null) return 'notDue';
        if (!isPastRetention(activity.gpsRecordedAt, now, this.policy.gpsMonths)) return 'notDue';
        await this.retention.clearGps(tx, activity.id, now);
        await this.audit.record(tx, {
          action: 'activity.gps_cleared',
          entityType: 'activity',
          entityId: activity.id,
          actorUserId: approver.id,
          newValues: { reference: approval.reference },
          reason: approval.reason,
          requestId,
        });
        return 'purged';
      }
      const note = item.attachmentId
        ? await this.retention.voiceNote(tx, activity.id, item.attachmentId)
        : null;
      if (!note)
        throw new BadRequestException({
          code: 'ATTACHMENT_NOT_FOUND',
          message: 'No such voice note on that report.',
        });
      if (note.purgedAt !== null) return 'notDue';
      if (!isPastRetention(note.createdAt, now, this.policy.voiceNoteMonths)) return 'notDue';
      if (note.archivedAt === null) {
        await this.retention.archiveForPurge(tx, note.id, {
          actorUserId: approver.id,
          reason: `Retention: ${approval.reference}`,
          at: now,
        });
      }
      await this.retention.markPurged(tx, note.id, {
        actorUserId: approver.id,
        reason: approval.reason,
        reference: approval.reference,
        at: now,
      });
      // Removed before commit: if the file cannot be deleted the whole item rolls back and stays visible.
      await this.storage.remove(note.storageKey);
      await this.audit.record(tx, {
        action: 'attachment.purged',
        entityType: 'activity',
        entityId: activity.id,
        actorUserId: approver.id,
        newValues: { attachmentId: note.id, category: 'VOICE_NOTE', reference: approval.reference },
        reason: approval.reason,
        requestId,
      });
      return 'purged';
    });
  }
}
