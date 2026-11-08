import { ActivityType } from '@autonova/enums';
import { ApiError } from '@/lib/api-client';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  VISIT: 'Site visit',
  CALL: 'Call',
  DEMO: 'Demo',
  MEETING: 'Meeting',
};

export const CATEGORY_LABELS = {
  PHOTO: 'Photo',
  VOICE_NOTE: 'Voice note',
  DOCUMENT: 'Document',
} as const;

const MESSAGES: Record<string, string> = {
  ACTIVITY_NOT_YOURS: 'Only the person who recorded this report, or a Director, can change it.',
  ACTIVITY_ARCHIVED: 'This report is archived. Restore it before changing it.',
  ACTIVITY_ATTENDEE_UNAVAILABLE: 'Each attendee contact must be a contact of the lead’s company.',
  ACTIVITY_DIRECTOR_ONLY: 'Only a Director can archive or restore a report or remove a file.',
  ATTENDEE_NOT_EXTERNAL: 'That attendee is already linked to a contact.',
  ACTIVITY_HOLD_EXISTS: 'This report is already under a hold.',
  ACTIVITY_NOT_HELD: 'This report is not under a hold.',
  RECORDING_NOTICE_REQUIRED:
    'A voice note can only be added once the participants have been told they were being recorded.',
  ATTACHMENT_TOTAL_EXCEEDED:
    'Adding this file would go over the total size allowed for one report. Remove a file to make room.',
  ATTACHMENT_LIMIT_REACHED: 'This report already has 20 attachments. Remove one to add another.',
  ATTACHMENT_TOO_LARGE:
    'That file is too large. Photos can be up to 10 MB, documents 25 MB and voice notes 20 MB.',
  ATTACHMENT_TYPE_NOT_ALLOWED: 'That file type is not accepted here.',
  ATTACHMENT_CONTENT_MISMATCH:
    'The file’s contents do not match its type. Choose the original file.',
  ATTACHMENT_FILE_UNAVAILABLE: 'The stored file is unavailable. Contact an administrator.',
  ATTACHMENT_NOT_FOUND: 'This attachment is no longer available.',
  ACTIVITY_NOT_FOUND: 'This report is unavailable.',
  LEAD_NOT_FOUND: 'This lead is unavailable in your pipeline.',
};

/** Safe, plain-language message for a failed report or attachment request. Never echoes the server's text. */
export function activityErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    if (error.status === 401) return 'Your session ended. Sign in again.';
    if (error.status === 403) return 'You do not have access to this.';
    if (error.status === 404) return 'This record is unavailable.';
    if (error.status === 429) return 'Too many requests. Wait a moment and try again.';
    if (error.status === 0) {
      return error.code === 'UPLOAD_CANCELLED'
        ? 'The upload was cancelled.'
        : 'We could not reach the server. Check your connection and try again.';
    }
  }
  return 'We could not complete the request. Check the details and try again.';
}

/** Whether trying the same request again could succeed: a dropped connection or a server fault. */
export const isRetryable = (error: unknown) =>
  error instanceof ApiError &&
  error.code !== 'UPLOAD_CANCELLED' &&
  (error.status === 0 || error.status >= 500);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
