import { randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Readable } from 'node:stream';
import type { ActivityAttachmentDto } from '@autonova/contracts';
import { MAX_ATTACHMENTS_PER_ACTIVITY, sanitizeFileName } from '@autonova/validation';
import type { Env } from '../../../config/env.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import {
  FILE_STORAGE,
  StoredFileMissingError,
  type FileStorage,
} from '../../storage/file-storage.js';
import { checkAttachmentContent } from '../domain/attachment-content.js';
import {
  attachmentLimitsFrom,
  fitsTotal,
  type AttachmentLimits,
} from '../domain/attachment-limits.js';
import {
  AttachmentsRepository,
  toAttachmentDto,
} from '../infrastructure/attachments.repository.js';
import type {
  RemoveAttachmentBody,
  UploadAttachmentBody,
} from '../presentation/activities.schemas.js';
import { ACTIVITY_NOT_FOUND, ActivitiesUseCases } from './activities.use-cases.js';
import { ActivitiesRepository } from '../infrastructure/activities.repository.js';

export const ATTACHMENT_NOT_FOUND = {
  code: 'ATTACHMENT_NOT_FOUND',
  message: 'Attachment not found',
};
const TOO_MANY = {
  code: 'ATTACHMENT_LIMIT_REACHED',
  message: 'This report already has the maximum number of attachments. Remove one to add another.',
};
const TOTAL_EXCEEDED = {
  code: 'ATTACHMENT_TOTAL_EXCEEDED',
  message:
    'Adding this file would go over the total size allowed for one report. Remove a file to make room.',
};
const NOTICE_REQUIRED = {
  code: 'VALIDATION_FAILED',
  message: 'Confirm whether the participants were told they were being recorded.',
  details: [
    {
      path: 'recordingNoticeGiven',
      message: 'Say whether the participants were told they were being recorded.',
    },
  ],
};
const NOTICE_NOT_GIVEN = {
  code: 'RECORDING_NOTICE_REQUIRED',
  message:
    'A voice note can only be added once the participants have been told they were being recorded.',
};
const NOTICE_ONLY_FOR_VOICE = {
  code: 'VALIDATION_FAILED',
  message: 'The recording notice only applies to voice notes.',
  details: [{ path: 'recordingNoticeGiven', message: 'Only voice notes record a notice.' }],
};
const MISSING_FILE = {
  code: 'VALIDATION_FAILED',
  message: 'Choose a file to upload.',
  details: [{ path: 'file', message: 'Choose a file to upload.' }],
};
const FILE_GONE = {
  code: 'ATTACHMENT_FILE_UNAVAILABLE',
  message: 'The stored file is unavailable. Contact an administrator.',
};

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface DownloadedAttachment {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Uploads are untrusted. The order is: caller may change the activity -> the real bytes pass the content
 * check -> bytes are stored under a random key -> the metadata row and audit event commit together. If
 * that last step fails the stored bytes are removed, so a failed upload never leaves a misleading record
 * or an orphaned file.
 */
@Injectable()
export class AttachmentsUseCases {
  private readonly logger = new Logger(AttachmentsUseCases.name);
  private readonly limits: AttachmentLimits;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsRepository,
    private readonly activities: ActivitiesRepository,
    private readonly activityRules: ActivitiesUseCases,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {
    this.limits = attachmentLimitsFrom({
      photoMb: config.get('ATTACHMENT_PHOTO_MAX_MB', { infer: true }),
      documentMb: config.get('ATTACHMENT_DOCUMENT_MAX_MB', { infer: true }),
      voiceNoteMb: config.get('ATTACHMENT_VOICE_NOTE_MAX_MB', { infer: true }),
      totalMb: config.get('ACTIVITY_ATTACHMENT_TOTAL_MAX_MB', { infer: true }),
    });
  }

  /** The configured limits, for the multipart parser's request cap. */
  get attachmentLimits(): AttachmentLimits {
    return this.limits;
  }

  async list(leadId: string, activityId: string, user: AuthenticatedUser) {
    await this.requireActivity(leadId, activityId, user);
    return this.attachments.listForActivity(activityId);
  }

  async upload(
    leadId: string,
    activityId: string,
    body: UploadAttachmentBody,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityAttachmentDto> {
    await this.activityRules.requireLead(leadId, user);
    await this.activityRules.requireModifiable(leadId, activityId, user);
    if (!file || file.buffer.length === 0) throw new BadRequestException(MISSING_FILE);

    const fileName = sanitizeFileName(file.originalname);
    const notice = this.recordingNotice(body);
    const checked = await checkAttachmentContent(
      body.category,
      file.buffer,
      fileName,
      this.limits.perFileBytes[body.category],
    );
    if (!checked.ok) throw contentError(checked.code, body.category);

    const id = randomUUID();
    const storageKey = randomUUID();
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(storageKey, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Counted inside the transaction so two simultaneous uploads cannot both slip past the limit.
        await tx.$executeRaw`SELECT 1 FROM "activities" WHERE "id" = ${activityId}::uuid FOR UPDATE`;
        if ((await this.attachments.countActive(tx, activityId)) >= MAX_ATTACHMENTS_PER_ACTIVITY) {
          throw new ConflictException(TOO_MANY);
        }
        const used = await this.attachments.activeBytes(tx, activityId);
        if (!fitsTotal(this.limits, used, file.buffer.length)) {
          throw new PayloadTooLargeException(TOTAL_EXCEEDED);
        }
        const row = await this.attachments.create(tx, {
          id,
          activityId,
          category: body.category,
          fileName,
          storageKey,
          mimeType: checked.mimeType,
          sizeBytes: file.buffer.length,
          sha256,
          uploadedByUserId: user.id,
          recordingNoticeGiven: notice,
        });
        await this.audit.record(tx, {
          action: 'attachment.uploaded',
          entityType: 'activity',
          entityId: activityId,
          actorUserId: user.id,
          // File content and name are not copied into the audit trail; the id and size identify it.
          newValues: {
            attachmentId: id,
            category: body.category,
            mimeType: checked.mimeType,
            sizeBytes: file.buffer.length,
            ...(notice === null ? {} : { recordingNoticeGiven: notice }),
          },
          requestId,
        });
        return toAttachmentDto(row);
      });
    } catch (error) {
      await this.discard(storageKey);
      throw error;
    }
  }

  async download(
    leadId: string,
    activityId: string,
    attachmentId: string,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<DownloadedAttachment> {
    await this.requireActivity(leadId, activityId, user);
    const row = await this.attachments.findInActivity(activityId, attachmentId);
    if (!row || row.archivedAt || row.purgedAt) throw new NotFoundException(ATTACHMENT_NOT_FOUND);
    let stream: Readable;
    try {
      stream = await this.storage.open(row.storageKey);
    } catch (error) {
      if (error instanceof StoredFileMissingError) {
        this.logger.error({ attachmentId, activityId }, 'Attachment metadata has no stored file');
        throw new NotFoundException(FILE_GONE);
      }
      throw error;
    }
    await this.audit.recordSecurity({
      action: 'attachment.downloaded',
      entityType: 'activity',
      entityId: activityId,
      actorUserId: user.id,
      newValues: { attachmentId },
      requestId,
    });
    return { stream, fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
  }

  /**
   * Removes an attachment from the report: its metadata is archived with who and why (Director only, decision
   * 2026-11-08). The stored bytes stay until the reviewed retention process purges them, so a mistaken removal
   * can be undone by an operator and the history never points at a file that silently vanished.
   */
  async archive(
    leadId: string,
    activityId: string,
    attachmentId: string,
    input: RemoveAttachmentBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<void> {
    await this.activityRules.requireLead(leadId, user);
    await this.activityRules.requireArchivist(leadId, activityId, user);
    const row = await this.attachments.findInActivity(activityId, attachmentId);
    if (!row || row.archivedAt) throw new NotFoundException(ATTACHMENT_NOT_FOUND);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.attachments.archive(
        tx,
        attachmentId,
        user.id,
        input.reason,
        new Date(),
      );
      if (changed.count !== 1) throw new NotFoundException(ATTACHMENT_NOT_FOUND);
      await this.audit.record(tx, {
        action: 'attachment.archived',
        entityType: 'activity',
        entityId: activityId,
        actorUserId: user.id,
        newValues: { attachmentId, category: row.category },
        reason: input.reason,
        requestId,
      });
    });
  }

  /**
   * Voice notes must say whether the participants were told; anything but "yes" is refused, because recording
   * is user-initiated and participants must be notified (decision 2026-11-08). Other kinds never carry it.
   */
  private recordingNotice(body: UploadAttachmentBody): boolean | null {
    if (body.category !== 'VOICE_NOTE') {
      if (body.recordingNoticeGiven !== undefined)
        throw new BadRequestException(NOTICE_ONLY_FOR_VOICE);
      return null;
    }
    if (body.recordingNoticeGiven === undefined) throw new BadRequestException(NOTICE_REQUIRED);
    if (body.recordingNoticeGiven !== 'true') throw new BadRequestException(NOTICE_NOT_GIVEN);
    return true;
  }

  /** The activity within a lead the caller may see; read access does not depend on who recorded it. */
  private async requireActivity(leadId: string, activityId: string, user: AuthenticatedUser) {
    await this.activityRules.requireLead(leadId, user);
    const activity = await this.activities.findInLead(leadId, activityId);
    if (!activity) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    return activity;
  }

  private async discard(storageKey: string) {
    try {
      await this.storage.remove(storageKey);
    } catch (error) {
      // The row was not saved, so this orphan is harmless but must be visible to operators.
      this.logger.error({ err: error, storageKey }, 'Could not remove an orphaned upload');
    }
  }
}

function contentError(
  code: 'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED' | 'CONTENT_MISMATCH',
  category: string,
) {
  switch (code) {
    case 'EMPTY':
      return new BadRequestException(MISSING_FILE);
    case 'TOO_LARGE':
      return new PayloadTooLargeException({
        code: 'ATTACHMENT_TOO_LARGE',
        message: `That file is larger than the limit for ${category.toLowerCase().replace('_', ' ')}s.`,
      });
    case 'TYPE_NOT_ALLOWED':
      return new UnsupportedMediaTypeException({
        code: 'ATTACHMENT_TYPE_NOT_ALLOWED',
        message: `That file type is not accepted for a ${category.toLowerCase().replace('_', ' ')}.`,
      });
    case 'CONTENT_MISMATCH':
      return new UnsupportedMediaTypeException({
        code: 'ATTACHMENT_CONTENT_MISMATCH',
        message: 'The file’s contents do not match its type. Choose the original file.',
      });
  }
}
