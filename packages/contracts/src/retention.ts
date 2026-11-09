/** What a retention review found, without changing anything. */
export interface RetentionCandidateDto {
  kind: 'GPS' | 'VOICE_NOTE';
  activityId: string;
  leadId: string;
  attachmentId: string | null;
  recordedAt: string;
  ageMonths: number;
  /** A held report is listed but cannot be purged. */
  held: boolean;
  holdReference: string | null;
}

export interface RetentionReviewDto {
  asOf: string;
  gpsMonths: number;
  voiceNoteMonths: number;
  candidates: RetentionCandidateDto[];
}

export interface RetentionApprovalRequest {
  /** What the approval covers, so a person approves a reviewed list and never "everything". */
  items: { kind: 'GPS' | 'VOICE_NOTE'; activityId: string; attachmentId?: string }[];
  /** The policy decision or ticket this purge follows. */
  reference: string;
  reason: string;
}

export interface RetentionOutcomeDto {
  purged: number;
  skippedHeld: number;
  skippedNotDue: number;
  failed: number;
}

export interface PlaceHoldRequest {
  reference: string;
  reason: string;
}
