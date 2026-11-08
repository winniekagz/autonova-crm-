import type { AttachmentRuleCategory } from '@autonova/validation';

const MB = 1024 * 1024;

export interface AttachmentLimits {
  /** Largest single file, per category, in bytes. */
  perFileBytes: Record<AttachmentRuleCategory, number>;
  /** Largest total of all active attachments on one report, in bytes. */
  totalBytes: number;
}

export interface LimitSettings {
  photoMb: number;
  documentMb: number;
  voiceNoteMb: number;
  totalMb: number;
}

export const attachmentLimitsFrom = (settings: LimitSettings): AttachmentLimits => ({
  perFileBytes: {
    PHOTO: Math.floor(settings.photoMb * MB),
    DOCUMENT: Math.floor(settings.documentMb * MB),
    VOICE_NOTE: Math.floor(settings.voiceNoteMb * MB),
  },
  totalBytes: Math.floor(settings.totalMb * MB),
});

/** The multipart parser's cap: the largest single file allowed in any category. */
export const largestFileBytes = (limits: AttachmentLimits) =>
  Math.max(...Object.values(limits.perFileBytes));

/** Whether adding a file keeps the report within its total; `usedBytes` counts active attachments only. */
export function fitsTotal(limits: AttachmentLimits, usedBytes: number, addingBytes: number) {
  return usedBytes + addingBytes <= limits.totalBytes;
}
