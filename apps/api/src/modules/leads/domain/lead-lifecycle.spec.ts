import {
  LeadDisqualificationReason as Disqualification,
  LeadStage as Stage,
} from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import {
  canTransitionLead,
  validateDisqualification,
  validateLeadTransition,
  validateLostReason,
} from './lead-lifecycle.js';

describe('lead lifecycle rules', () => {
  it('allows only the documented forward stages', () => {
    expect(canTransitionLead(Stage.NewLead, Stage.VisitsAndCalls)).toBe(true);
    expect(canTransitionLead(Stage.VisitsAndCalls, Stage.Qualified)).toBe(true);
    expect(canTransitionLead(Stage.Qualified, Stage.ScopeAlignment)).toBe(true);
    expect(canTransitionLead(Stage.ScopeAlignment, Stage.TorQuoteSent)).toBe(true);
    expect(canTransitionLead(Stage.NewLead, Stage.Qualified)).toBe(false);
    expect(canTransitionLead(Stage.TorQuoteSent, Stage.Won)).toBe(false);
    expect(canTransitionLead(Stage.Lost, Stage.NewLead)).toBe(false);
  });

  it('requires a qualification note and rejects terminal/outcome stages in generic transitions', () => {
    expect(validateLeadTransition(Stage.VisitsAndCalls, Stage.Qualified)).toEqual({
      ok: false,
      code: 'QUALIFICATION_NOTE_REQUIRED',
    });
    expect(validateLeadTransition(Stage.VisitsAndCalls, Stage.Qualified, 'BANT discussed')).toEqual(
      {
        ok: true,
      },
    );
    expect(validateLeadTransition(Stage.TorQuoteSent, Stage.Lost, 'Competitor')).toEqual({
      ok: false,
      code: 'INVALID_STAGE_TRANSITION',
    });
  });

  it('requires a date only for revisit-later disqualification', () => {
    expect(validateDisqualification(Disqualification.TimingRevisitLater)).toEqual({
      ok: false,
      code: 'REVISIT_DATE_REQUIRED',
    });
    expect(validateDisqualification(Disqualification.TimingRevisitLater, '2026-11-20')).toEqual({
      ok: true,
    });
    expect(validateDisqualification(Disqualification.NoBudget)).toEqual({ ok: true });
    expect(validateDisqualification(Disqualification.NoBudget, '2026-11-20')).toEqual({
      ok: false,
      code: 'REVISIT_DATE_NOT_ALLOWED',
    });
  });

  it('requires a non-empty Lost reason without imposing an undocumented reason catalog', () => {
    expect(validateLostReason('   ')).toEqual({ ok: false, code: 'LOST_REASON_REQUIRED' });
    expect(validateLostReason('Selected another provider')).toEqual({ ok: true });
  });
});
