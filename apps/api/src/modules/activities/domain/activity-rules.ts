import { ActivityType } from '@autonova/enums';

/** The latest an activity may be dated, allowing for clock differences between a phone and the server. */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;
export const MAX_ATTENDEES = 20;

export type ActivityRuleCode =
  | 'OCCURRED_IN_FUTURE'
  | 'GPS_ONLY_FOR_VISITS'
  | 'GPS_OUT_OF_RANGE'
  | 'TOO_MANY_ATTENDEES'
  | 'DUPLICATE_ATTENDEE';

export type ActivityRuleResult = { ok: true } | { ok: false; code: ActivityRuleCode };

export interface ActivityFacts {
  type: ActivityType;
  occurredAt: Date;
  gps: { latitude: number; longitude: number } | null;
  /** One entry per attendee: a contact id, or an outside person's normalised name and organisation. */
  attendeeKeys: readonly string[];
  now: Date;
}

/**
 * Business rules of a visit or call report that do not depend on stored data. The date is when the
 * interaction happened, so an old date is normal (people record afterwards); only the future is wrong.
 */
export function validateActivity(facts: ActivityFacts): ActivityRuleResult {
  if (facts.occurredAt.getTime() > facts.now.getTime() + FUTURE_TOLERANCE_MS) {
    return { ok: false, code: 'OCCURRED_IN_FUTURE' };
  }
  if (facts.gps) {
    if (facts.type !== ActivityType.Visit) return { ok: false, code: 'GPS_ONLY_FOR_VISITS' };
    const { latitude, longitude } = facts.gps;
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return { ok: false, code: 'GPS_OUT_OF_RANGE' };
    }
  }
  if (facts.attendeeKeys.length > MAX_ATTENDEES) return { ok: false, code: 'TOO_MANY_ATTENDEES' };
  if (new Set(facts.attendeeKeys).size !== facts.attendeeKeys.length) {
    return { ok: false, code: 'DUPLICATE_ATTENDEE' };
  }
  return { ok: true };
}

/** Coordinates are stored with six decimals (about 11 cm), which is more than a phone can really tell. */
export const roundCoordinate = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Who may change an existing report (decision 2026-11-08): its creator, and any Director. Reading is
 * governed by lead access; this concerns editing and adding attachments. Archiving is stricter.
 */
export function canModifyActivity(
  actor: { id: string; isDirector: boolean },
  activity: { createdByUserId: string },
): boolean {
  return actor.isDirector || activity.createdByUserId === actor.id;
}

/** Archiving and restoring are Director powers (decision 2026-11-08; the PRD gives "delete records" to Directors). */
export const canArchiveActivity = (actor: { isDirector: boolean }) => actor.isDirector;

/** A person's name compared case- and spacing-insensitively, for spotting the same attendee twice. */
export const attendeeNameKey = (name: string, organisation?: string | null) =>
  `ext:${name.trim().replace(/\s+/g, ' ').toLowerCase()}|${(organisation ?? '').trim().replace(/\s+/g, ' ').toLowerCase()}`;
