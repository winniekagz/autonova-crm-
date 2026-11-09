import { QualificationRating } from '@autonova/enums';
import type { QualificationRatings } from '@autonova/contracts';

/**
 * BANT scoring (SOW 4.4). The PRD leaves weights and the pass mark open (Q6 to Q8), so these are TEMPORARY
 * DEFAULTS: four equal criteria of 25 points, each met in full, in part (half) or not at all, and a pass
 * mark of 60. A Director changes them in settings; every assessment records the values it was scored with.
 */
export interface BantWeights {
  budget: number;
  authority: number;
  need: number;
  timeline: number;
}

export interface BantSettings {
  passMark: number;
  weights: BantWeights;
}

export const DEFAULT_BANT_SETTINGS: BantSettings = {
  passMark: 60,
  weights: { budget: 25, authority: 25, need: 25, timeline: 25 },
};

/** Fraction of a criterion's weight each rating earns. Part of the temporary default. */
const RATING_FRACTION: Record<QualificationRating, number> = {
  [QualificationRating.NotMet]: 0,
  [QualificationRating.PartiallyMet]: 0.5,
  [QualificationRating.FullyMet]: 1,
};

const CRITERIA = ['budget', 'authority', 'need', 'timeline'] as const;

export type BantSettingsProblem =
  'WEIGHTS_MUST_TOTAL_100' | 'WEIGHT_OUT_OF_RANGE' | 'PASS_MARK_OUT_OF_RANGE';

/** The score out of 100, rounded to a whole number. Always computed here, never taken from a client. */
export function scoreBant(ratings: QualificationRatings, settings: BantSettings): number {
  let total = 0;
  for (const criterion of CRITERIA) {
    total += settings.weights[criterion] * RATING_FRACTION[ratings[criterion]];
  }
  return Math.round(total);
}

export const passesBant = (score: number, passMark: number) => score >= passMark;

export function validateBantSettings(settings: BantSettings): BantSettingsProblem | null {
  const { passMark, weights } = settings;
  if (!Number.isInteger(passMark) || passMark < 1 || passMark > 100)
    return 'PASS_MARK_OUT_OF_RANGE';
  let sum = 0;
  for (const criterion of CRITERIA) {
    const weight = weights[criterion];
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) return 'WEIGHT_OUT_OF_RANGE';
    sum += weight;
  }
  return sum === 100 ? null : 'WEIGHTS_MUST_TOTAL_100';
}

export type QualifyDecision =
  | { ok: true; overridden: boolean }
  | {
      ok: false;
      code:
        'QUALIFICATION_NOT_ASSESSED' | 'QUALIFICATION_NOT_PASSED' | 'OVERRIDE_REQUIRES_DIRECTOR';
    };

/**
 * May the lead move to Qualified? Only on a passing assessment. A failing one needs a Director and a
 * written reason (PRD 4.4). A reason from someone who is not a Director is refused, not ignored, so a
 * salesperson cannot believe they overrode when they did not.
 */
export function decideQualification(input: {
  latest: { passed: boolean } | null;
  isDirector: boolean;
  overrideReason?: string | undefined;
}): QualifyDecision {
  if (!input.latest) return { ok: false, code: 'QUALIFICATION_NOT_ASSESSED' };
  const reason = input.overrideReason?.trim();
  if (input.latest.passed) return { ok: true, overridden: false };
  if (!reason) {
    return { ok: false, code: 'QUALIFICATION_NOT_PASSED' };
  }
  if (!input.isDirector) return { ok: false, code: 'OVERRIDE_REQUIRES_DIRECTOR' };
  return { ok: true, overridden: true };
}
