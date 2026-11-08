import { LeadDisqualificationReason, LeadStage } from '@autonova/enums';

export type LeadLifecycleErrorCode =
  | 'INVALID_STAGE_TRANSITION'
  | 'QUALIFICATION_NOTE_REQUIRED'
  | 'LOST_REASON_REQUIRED'
  | 'INVALID_DISQUALIFICATION_REASON'
  | 'REVISIT_DATE_REQUIRED'
  | 'REVISIT_DATE_NOT_ALLOWED'
  | 'LEAD_STAGE_CHANGED';

export type LeadLifecycleResult = { ok: true } | { ok: false; code: LeadLifecycleErrorCode };

const FORWARD_TRANSITIONS: Readonly<Partial<Record<LeadStage, readonly LeadStage[]>>> = {
  [LeadStage.NewLead]: [LeadStage.VisitsAndCalls],
  [LeadStage.VisitsAndCalls]: [LeadStage.Qualified],
  [LeadStage.Qualified]: [LeadStage.ScopeAlignment],
  [LeadStage.ScopeAlignment]: [LeadStage.TorQuoteSent],
  [LeadStage.TorQuoteSent]: [],
};

export function canTransitionLead(from: LeadStage, to: LeadStage): boolean {
  return FORWARD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function availableLeadLifecycle(stage: LeadStage) {
  return {
    transitions: [...(FORWARD_TRANSITIONS[stage] ?? [])],
    canDisqualify: stage === LeadStage.VisitsAndCalls,
    canMarkLost: stage === LeadStage.TorQuoteSent,
  };
}

export function validateLeadTransition(
  from: LeadStage,
  to: LeadStage,
  reason?: string,
): LeadLifecycleResult {
  if (!canTransitionLead(from, to)) return { ok: false, code: 'INVALID_STAGE_TRANSITION' };
  if (to === LeadStage.Qualified && !reason?.trim()) {
    return { ok: false, code: 'QUALIFICATION_NOTE_REQUIRED' };
  }
  return { ok: true };
}

export function validateDisqualification(
  reason: LeadDisqualificationReason,
  revisitOn?: string,
): LeadLifecycleResult {
  if (!Object.values(LeadDisqualificationReason).includes(reason)) {
    return { ok: false, code: 'INVALID_DISQUALIFICATION_REASON' };
  }
  const isRevisit = reason === LeadDisqualificationReason.TimingRevisitLater;
  if (isRevisit && !revisitOn) return { ok: false, code: 'REVISIT_DATE_REQUIRED' };
  if (!isRevisit && revisitOn) return { ok: false, code: 'REVISIT_DATE_NOT_ALLOWED' };
  return { ok: true };
}

export function validateLostReason(reason: string): LeadLifecycleResult {
  return reason.trim() ? { ok: true } : { ok: false, code: 'LOST_REASON_REQUIRED' };
}
