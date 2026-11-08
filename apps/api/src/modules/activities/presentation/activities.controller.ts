import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PermissionKey } from '@autonova/enums';
import type { ActivityAttachmentDto, ActivityDto, Paginated } from '@autonova/contracts';
import type { Request, Response } from 'express';
import { requestIdOf } from '../../../common/request-id.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { ActivitiesUseCases } from '../application/activities.use-cases.js';
import { RetentionUseCases } from '../application/retention.use-cases.js';
import {
  AttachmentsUseCases,
  type UploadedFile as Upload,
} from '../application/attachments.use-cases.js';
import {
  DocArchiveActivity,
  DocArchiveAttachment,
  DocCreateActivity,
  DocDownloadAttachment,
  DocGetActivity,
  DocListActivities,
  DocLiftHold,
  DocLinkAttendee,
  DocListAttachments,
  DocPlaceHold,
  DocRestoreActivity,
  DocUpdateActivity,
  DocUploadAttachment,
  activityBodySchema,
} from './activities.docs.js';
import {
  activityIdSchema,
  archiveActivitySchema,
  attachmentIdSchema,
  attendeeIdSchema,
  createActivitySchema,
  linkAttendeeSchema,
  listActivitiesQuerySchema,
  placeHoldSchema,
  removeAttachmentSchema,
  updateActivitySchema,
  uploadAttachmentSchema,
  type ArchiveActivityBody,
  type CreateActivityBody,
  type LinkAttendeeBody,
  type ListActivitiesQuery,
  type PlaceHoldBody,
  type RemoveAttachmentBody,
  type UpdateActivityBody,
  type UploadAttachmentBody,
} from './activities.schemas.js';
import { AttachmentUploadInterceptor } from './upload.interceptor.js';
import { leadIdSchema } from '../../leads/presentation/leads.schemas.js';

const PAGE = [
  { name: 'page', required: false, type: Number, description: '1-based page; defaults to 1.' },
  { name: 'pageSize', required: false, type: Number, description: 'Defaults to 25; maximum 100.' },
] as const;

@ApiTags('activities')
@ApiBearerAuth()
@Controller('leads/:leadId/activities')
export class ActivitiesController {
  constructor(
    private readonly activities: ActivitiesUseCases,
    private readonly attachments: AttachmentsUseCases,
    private readonly retention: RetentionUseCases,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.ActivitiesList)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'includeArchived', required: false, type: String })
  @ApiQuery(PAGE[0])
  @ApiQuery(PAGE[1])
  @ApiOperation({
    summary: 'List a lead’s visit and call reports',
    description:
      'Newest interaction first. Requires access to the lead (Directors any; others their own).',
  })
  @DocListActivities()
  list(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Query({ schema: listActivitiesQuerySchema }) query: ListActivitiesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<ActivityDto>> {
    return this.activities.list(leadId, query, user);
  }

  @Post()
  @RequirePermission(PermissionKey.ActivitiesCreate)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiOperation({
    summary: 'Record a visit, call, demo or meeting on a lead',
    description:
      'Creating a report never changes the lead’s stage and never replaces earlier reports. `occurredAt` is when the interaction happened and may be in the past.',
  })
  @ApiBody({ schema: activityBodySchema })
  @DocCreateActivity()
  create(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Body({ schema: createActivitySchema }) body: CreateActivityBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.activities.create(leadId, body, user, requestIdOf(request));
  }

  @Get(':id')
  @RequirePermission(PermissionKey.ActivitiesRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'View one report of a lead' })
  @DocGetActivity()
  get(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityDto> {
    return this.activities.get(leadId, id, user);
  }

  @Patch(':id')
  @RequirePermission(PermissionKey.ActivitiesUpdate)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Edit a report',
    description:
      'Only the person who recorded it, or a Director. Only supplied fields change; supplying `attendees` replaces the list. Edits are audited.',
  })
  @ApiBody({ schema: { ...activityBodySchema, required: [] } })
  @DocUpdateActivity()
  update(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Body({ schema: updateActivitySchema }) body: UpdateActivityBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.activities.update(leadId, id, body, user, requestIdOf(request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.ActivitiesArchive)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Archive a report',
    description:
      'Director only, with a reason. Reports are never deleted; archiving hides it from the timeline and the reason stays in the history.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reason'],
      properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
    },
  })
  @DocArchiveActivity()
  archive(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Body({ schema: archiveActivitySchema }) body: ArchiveActivityBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.activities.archive(leadId, id, body, user, requestIdOf(request));
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.ActivitiesArchive)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Restore an archived report (Director only)' })
  @DocRestoreActivity()
  restore(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.activities.restore(leadId, id, user, requestIdOf(request));
  }

  @Get(':id/attachments')
  @RequirePermission(PermissionKey.ActivitiesRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'List a report’s attachments' })
  @DocListAttachments()
  listAttachments(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ActivityAttachmentDto[]> {
    return this.attachments.list(leadId, id, user);
  }

  @Post(':id/attachments')
  @RequirePermission(PermissionKey.ActivitiesUpdate)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(AttachmentUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Upload a photo, voice note or document to a report',
    description:
      'Multipart form with `category` (PHOTO, VOICE_NOTE or DOCUMENT) and one `file`. Limits (configurable): photo 10 MB (jpg, png, webp), document 25 MB (pdf, docx, xlsx, csv), voice note 20 MB (mp3, m4a, wav, webm); 50 MB in total and 20 attachments per report. A voice note also needs `recordingNoticeGiven=true`: the participants must have been told they were being recorded. The real file contents are checked; the browser-declared type and the client file name are not trusted, and the file is stored privately under a random key. Files are not scanned for malware (docs/06 S8 is open).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['category', 'file'],
      properties: {
        category: { type: 'string', enum: ['PHOTO', 'VOICE_NOTE', 'DOCUMENT'] },
        recordingNoticeGiven: { type: 'string', enum: ['true', 'false'] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @DocUploadAttachment()
  upload(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Body({ schema: uploadAttachmentSchema }) body: UploadAttachmentBody,
    @UploadedFile() file: Upload | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityAttachmentDto> {
    return this.attachments.upload(leadId, id, body, file, user, requestIdOf(request));
  }

  @Get(':id/attachments/:attachmentId')
  @RequirePermission(PermissionKey.ActivitiesRead)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiOperation({
    summary: 'Download an attachment',
    description:
      'Runs the same access checks as the lead and report, then streams the file as an attachment. Never rendered inline.',
  })
  @DocDownloadAttachment()
  async download(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Param('attachmentId', { schema: attachmentIdSchema }) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.attachments.download(
      leadId,
      id,
      attachmentId,
      user,
      requestIdOf(request),
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', contentDisposition(file.fileName));
    file.stream.on('error', () => response.destroy());
    file.stream.pipe(response);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PermissionKey.ActivitiesArchive)
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reason'],
      properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
    },
  })
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiOperation({
    summary: 'Remove an attachment from a report',
    description:
      'Director only, with a reason. Archives the attachment so it no longer lists or downloads; who and why are recorded. The stored file is kept until the reviewed retention process purges it.',
  })
  @DocArchiveAttachment()
  async removeAttachment(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Param('attachmentId', { schema: attachmentIdSchema }) attachmentId: string,
    @Body({ schema: removeAttachmentSchema }) body: RemoveAttachmentBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.attachments.archive(leadId, id, attachmentId, body, user, requestIdOf(request));
  }

  @Post(':id/attendees/:attendeeId/link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.ActivitiesUpdate)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'attendeeId', format: 'uuid' })
  @ApiOperation({
    summary: 'Link an outside attendee to a CRM contact',
    description:
      'Same rights as editing the report. The contact must belong to the lead’s company. The name recorded at the time is kept. No contact is ever created from an outside attendee.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['contactId'],
      properties: { contactId: { type: 'string', format: 'uuid' } },
    },
  })
  @DocLinkAttendee()
  linkAttendee(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Param('attendeeId', { schema: attendeeIdSchema }) attendeeId: string,
    @Body({ schema: linkAttendeeSchema }) body: LinkAttendeeBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.activities.linkAttendee(leadId, id, attendeeId, body, user, requestIdOf(request));
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.ActivitiesRetention)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Place a legal hold or approved retention exception on a report',
    description:
      'Director only. Retention never clears the check-in or purges the voice notes of a held report. A reference (for example the matter or approval number) and a reason are required and audited.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reference', 'reason'],
      properties: {
        reference: { type: 'string', minLength: 1, maxLength: 120 },
        reason: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
  })
  @DocPlaceHold()
  placeHold(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Body({ schema: placeHoldSchema }) body: PlaceHoldBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.retention.placeHold(leadId, id, body, user, requestIdOf(request));
  }

  @Delete(':id/hold')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.ActivitiesRetention)
  @ApiParam({ name: 'leadId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Lift a hold',
    description:
      'Director only, with a reason. The report becomes eligible for retention review again.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reason'],
      properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
    },
  })
  @DocLiftHold()
  liftHold(
    @Param('leadId', { schema: leadIdSchema }) leadId: string,
    @Param('id', { schema: activityIdSchema }) id: string,
    @Body({ schema: removeAttachmentSchema }) body: RemoveAttachmentBody,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ActivityDto> {
    return this.retention.liftHold(leadId, id, body, user, requestIdOf(request));
  }
}

/** RFC 6266/5987: an ASCII fallback plus the real name percent-encoded, so no character can end the header. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
