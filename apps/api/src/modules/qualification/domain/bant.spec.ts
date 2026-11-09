import { QualificationRating as R } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BANT_SETTINGS,
  decideQualification,
  passesBant,
  scoreBant,
  validateBantSettings,
} from './bant.js';

const all = (rating: R) => ({ budget: rating, authority: rating, need: rating, timeline: rating });

describe('BANT scoring', () => {
  it('scores 100, 50 and 0 for all met, all partial and none', () => {
    expect(scoreBant(all(R.FullyMet), DEFAULT_BANT_SETTINGS)).toBe(100);
    expect(scoreBant(all(R.PartiallyMet), DEFAULT_BANT_SETTINGS)).toBe(50);
    expect(scoreBant(all(R.NotMet), DEFAULT_BANT_SETTINGS)).toBe(0);
  });

  it('adds each criterion by its weight', () => {
    const ratings = {
      budget: R.FullyMet,
      authority: R.FullyMet,
      need: R.PartiallyMet,
      timeline: R.NotMet,
    };
    expect(scoreBant(ratings, DEFAULT_BANT_SETTINGS)).toBe(63);
    const weighted = {
      passMark: 70,
      weights: { budget: 40, authority: 30, need: 20, timeline: 10 },
    };
    expect(scoreBant(ratings, weighted)).toBe(80);
  });

  it('passes exactly at the pass mark and fails one point below', () => {
    expect(passesBant(60, 60)).toBe(true);
    expect(passesBant(59, 60)).toBe(false);
  });

  it('rejects settings that do not total 100 or are out of range', () => {
    expect(validateBantSettings(DEFAULT_BANT_SETTINGS)).toBeNull();
    expect(
      validateBantSettings({
        passMark: 60,
        weights: { budget: 30, authority: 25, need: 25, timeline: 25 },
      }),
    ).toBe('WEIGHTS_MUST_TOTAL_100');
    expect(validateBantSettings({ passMark: 0, weights: DEFAULT_BANT_SETTINGS.weights })).toBe(
      'PASS_MARK_OUT_OF_RANGE',
    );
    expect(validateBantSettings({ passMark: 101, weights: DEFAULT_BANT_SETTINGS.weights })).toBe(
      'PASS_MARK_OUT_OF_RANGE',
    );
    expect(
      validateBantSettings({
        passMark: 60,
        weights: { budget: -5, authority: 55, need: 25, timeline: 25 },
      }),
    ).toBe('WEIGHT_OUT_OF_RANGE');
    expect(
      validateBantSettings({
        passMark: 60,
        weights: { budget: 25.5, authority: 24.5, need: 25, timeline: 25 },
      }),
    ).toBe('WEIGHT_OUT_OF_RANGE');
  });
});

describe('who may qualify a lead', () => {
  it('needs an assessment first', () => {
    expect(decideQualification({ latest: null, isDirector: true })).toEqual({
      ok: false,
      code: 'QUALIFICATION_NOT_ASSESSED',
    });
  });

  it('lets anyone qualify a passing lead, without an override', () => {
    expect(decideQualification({ latest: { passed: true }, isDirector: false })).toEqual({
      ok: true,
      overridden: false,
    });
  });

  it('refuses a failing lead without an override reason', () => {
    for (const isDirector of [true, false]) {
      expect(decideQualification({ latest: { passed: false }, isDirector })).toEqual({
        ok: false,
        code: 'QUALIFICATION_NOT_PASSED',
      });
      expect(
        decideQualification({ latest: { passed: false }, isDirector, overrideReason: '   ' }),
      ).toEqual({ ok: false, code: 'QUALIFICATION_NOT_PASSED' });
    }
  });

  it('lets only a Director override, and then needs the reason', () => {
    expect(
      decideQualification({
        latest: { passed: false },
        isDirector: true,
        overrideReason: 'Strategic account',
      }),
    ).toEqual({ ok: true, overridden: true });
    expect(
      decideQualification({
        latest: { passed: false },
        isDirector: false,
        overrideReason: 'Please',
      }),
    ).toEqual({ ok: false, code: 'OVERRIDE_REQUIRES_DIRECTOR' });
  });

  it('does not call a passing lead overridden just because a reason was sent', () => {
    expect(
      decideQualification({
        latest: { passed: true },
        isDirector: true,
        overrideReason: 'not needed',
      }),
    ).toEqual({ ok: true, overridden: false });
  });
});
