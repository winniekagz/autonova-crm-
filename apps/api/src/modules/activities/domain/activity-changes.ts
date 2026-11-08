/** What an edit changed, field by field, for the audit trail. */
export interface ActivityFacts {
  type: string;
  occurredAt: string;
  location: string | null;
  discussion: string;
  painPoints: string | null;
  currentTools: string | null;
  nextSteps: string | null;
  hasGps: boolean;
  /** One label per attendee, order-independent. */
  attendees: readonly string[];
}

export interface FieldChange {
  field: string;
  before: string | boolean | number | null;
  after: string | boolean | number | null;
}

/** Free text can run to thousands of characters and may hold personal detail, so the trail records its size. */
const TEXT_FIELDS = ['discussion', 'painPoints', 'currentTools', 'nextSteps'] as const;
const SHORT_FIELDS = ['type', 'occurredAt', 'location'] as const;

const length = (value: string | null) => (value === null ? 0 : value.length);

/**
 * The fields that differ between two versions of a report. Short structured fields are recorded with
 * their values; long free text is recorded as a length change ("discussion: 120 -> 164 characters")
 * because copying it would duplicate personal data into an append-only table that can never be cleaned.
 * A check-in is recorded as set or removed, never as coordinates.
 */
export function changedFields(before: ActivityFacts, after: ActivityFacts): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of SHORT_FIELDS) {
    if (before[field] !== after[field]) {
      changes.push({ field, before: before[field], after: after[field] });
    }
  }
  for (const field of TEXT_FIELDS) {
    if (before[field] !== after[field]) {
      changes.push({
        field: `${field}Length`,
        before: length(before[field]),
        after: length(after[field]),
      });
    }
  }
  if (before.hasGps !== after.hasGps) {
    changes.push({ field: 'checkIn', before: before.hasGps, after: after.hasGps });
  }
  const was = [...before.attendees].sort().join('|');
  const now = [...after.attendees].sort().join('|');
  if (was !== now) {
    changes.push({
      field: 'attendeeCount',
      before: before.attendees.length,
      after: after.attendees.length,
    });
  }
  return changes;
}

/** A compact, queryable snapshot: only the fields that changed, before and after. */
export function auditDiff(changes: readonly FieldChange[]) {
  const oldValues: Record<string, string | boolean | number | null> = {};
  const newValues: Record<string, string | boolean | number | null> = {};
  for (const change of changes) {
    oldValues[change.field] = change.before;
    newValues[change.field] = change.after;
  }
  return { oldValues, newValues, changedFields: changes.map((change) => change.field).join(',') };
}
