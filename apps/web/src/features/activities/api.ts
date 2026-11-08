import type {
  ActivityAttachmentDto,
  ActivityAttendeeDto,
  ActivityDto,
  ActivityInput,
  Paginated,
} from '@autonova/contracts';
import { ActivityType, AttachmentCategory, enumValues } from '@autonova/enums';
import { apiDownload, apiRequest, apiRequestVoid, apiUpload } from '@/lib/api-client';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const orNull = (v: unknown) => v === null || typeof v === 'string';
const types: readonly string[] = enumValues(ActivityType);
const categories: readonly string[] = enumValues(AttachmentCategory);

const isHold = (v: unknown) =>
  isRecord(v) &&
  typeof v.reference === 'string' &&
  typeof v.reason === 'string' &&
  typeof v.placedAt === 'string' &&
  orNull(v.placedByName);

function parseAttendee(value: unknown): ActivityAttendeeDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.kind !== 'CONTACT' && value.kind !== 'EXTERNAL') ||
    !orNull(value.contactId) ||
    typeof value.name !== 'string' ||
    !orNull(value.organisation) ||
    !orNull(value.jobTitle) ||
    !orNull(value.recordedAs) ||
    !orNull(value.linkedAt)
  ) {
    throw new Error('Unexpected attendee in the server response');
  }
  return value as unknown as ActivityAttendeeDto;
}

export function parseActivity(value: unknown): ActivityDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.leadId !== 'string' ||
    typeof value.type !== 'string' ||
    !types.includes(value.type) ||
    typeof value.occurredAt !== 'string' ||
    !orNull(value.location) ||
    !(
      value.gps === null ||
      (isRecord(value.gps) &&
        typeof value.gps.latitude === 'number' &&
        typeof value.gps.longitude === 'number')
    ) ||
    typeof value.discussion !== 'string' ||
    !orNull(value.painPoints) ||
    !orNull(value.currentTools) ||
    !orNull(value.nextSteps) ||
    !Array.isArray(value.attendees) ||
    typeof value.attachmentCount !== 'number' ||
    typeof value.attachmentBytes !== 'number' ||
    typeof value.archived !== 'boolean' ||
    !orNull(value.archivedReason) ||
    !(value.hold === null || isHold(value.hold)) ||
    typeof value.gpsCleared !== 'boolean' ||
    typeof value.createdByUserId !== 'string' ||
    !orNull(value.createdByName) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Unexpected activity response from the server');
  }
  value.attendees.forEach(parseAttendee);
  return value as unknown as ActivityDto;
}

export function parseAttachment(value: unknown): ActivityAttachmentDto {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.activityId !== 'string' ||
    typeof value.category !== 'string' ||
    !categories.includes(value.category) ||
    typeof value.fileName !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.sizeBytes !== 'number' ||
    !orNull(value.uploadedByName) ||
    !(value.recordingNoticeGiven === null || typeof value.recordingNoticeGiven === 'boolean') ||
    typeof value.createdAt !== 'string'
  ) {
    throw new Error('Unexpected attachment response from the server');
  }
  return value as unknown as ActivityAttachmentDto;
}

function parsePage(json: unknown): Paginated<ActivityDto> {
  if (
    !isRecord(json) ||
    !Array.isArray(json.items) ||
    typeof json.total !== 'number' ||
    typeof json.page !== 'number' ||
    typeof json.pageSize !== 'number'
  ) {
    throw new Error('Unexpected activity list response from the server');
  }
  return {
    items: json.items.map(parseActivity),
    total: json.total,
    page: json.page,
    pageSize: json.pageSize,
  };
}

function parseAttachments(json: unknown): ActivityAttachmentDto[] {
  if (!Array.isArray(json)) throw new Error('Unexpected attachment list response from the server');
  return json.map(parseAttachment);
}

const base = (leadId: string) => `/leads/${encodeURIComponent(leadId)}/activities`;
const one = (leadId: string, id: string) => `${base(leadId)}/${encodeURIComponent(id)}`;

export const listActivities = (
  token: string,
  leadId: string,
  page: number,
  pageSize: number,
  type = '',
) =>
  apiRequest(
    `${base(leadId)}?page=${page}&pageSize=${pageSize}${type ? `&type=${type}` : ''}`,
    parsePage,
    { token },
  );
export const createActivity = (token: string, leadId: string, body: ActivityInput) =>
  apiRequest(base(leadId), parseActivity, { method: 'POST', body, token });
export const updateActivity = (
  token: string,
  leadId: string,
  id: string,
  body: Partial<ActivityInput>,
) => apiRequest(one(leadId, id), parseActivity, { method: 'PATCH', body, token });
export const archiveActivity = (token: string, leadId: string, id: string, reason: string) =>
  apiRequest(`${one(leadId, id)}/archive`, parseActivity, {
    method: 'POST',
    body: { reason },
    token,
  });
export const restoreActivity = (token: string, leadId: string, id: string) =>
  apiRequest(`${one(leadId, id)}/restore`, parseActivity, { method: 'POST', body: {}, token });

export const listAttachments = (token: string, leadId: string, id: string) =>
  apiRequest(`${one(leadId, id)}/attachments`, parseAttachments, { token });
export const uploadAttachment = (
  token: string,
  leadId: string,
  id: string,
  input: { category: AttachmentCategory; file: File; recordingNoticeGiven?: boolean },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
) => {
  const form = new FormData();
  form.append('category', input.category);
  if (input.recordingNoticeGiven !== undefined) {
    form.append('recordingNoticeGiven', String(input.recordingNoticeGiven));
  }
  form.append('file', input.file, input.file.name);
  return apiUpload(`${one(leadId, id)}/attachments`, form, parseAttachment, {
    token,
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  });
};
export const downloadAttachment = (
  token: string,
  leadId: string,
  id: string,
  attachmentId: string,
) => apiDownload(`${one(leadId, id)}/attachments/${encodeURIComponent(attachmentId)}`, token);
export const removeAttachment = (
  token: string,
  leadId: string,
  id: string,
  attachmentId: string,
  reason: string,
) =>
  apiRequestVoid(`${one(leadId, id)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
    body: { reason },
    token,
  });

export const linkAttendee = (
  token: string,
  leadId: string,
  id: string,
  attendeeId: string,
  contactId: string,
) =>
  apiRequest(`${one(leadId, id)}/attendees/${encodeURIComponent(attendeeId)}/link`, parseActivity, {
    method: 'POST',
    body: { contactId },
    token,
  });

export const placeHold = (
  token: string,
  leadId: string,
  id: string,
  body: { reference: string; reason: string },
) => apiRequest(`${one(leadId, id)}/hold`, parseActivity, { method: 'POST', body, token });

export const liftHold = (token: string, leadId: string, id: string, reason: string) =>
  apiRequest(`${one(leadId, id)}/hold`, parseActivity, {
    method: 'DELETE',
    body: { reason },
    token,
  });
