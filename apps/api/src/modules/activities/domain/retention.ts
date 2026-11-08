/** Retention periods are calendar months, counted from when the item was recorded. */
export interface RetentionPolicy {
  gpsMonths: number;
  voiceNoteMonths: number;
}

/** The instant before which an item recorded then is past its retention period (UTC calendar months). */
export function retentionCutoff(now: Date, months: number): Date {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDay));
  return cutoff;
}

/** Whole calendar months between a recording and now, never negative. */
export function ageInMonths(recordedAt: Date, now: Date): number {
  let months =
    (now.getUTCFullYear() - recordedAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - recordedAt.getUTCMonth());
  if (retentionCutoff(now, months) < recordedAt) months -= 1;
  return Math.max(0, months);
}

export const isPastRetention = (recordedAt: Date, now: Date, months: number): boolean =>
  recordedAt <= retentionCutoff(now, months);
