/**
 * Autonova works on Nairobi time (Africa/Nairobi, UTC+3, no daylight saving), whatever timezone the
 * browser is in. The API's reminder worker uses the same zone, so a follow-up chosen here is the
 * moment the reminder becomes due.
 */
const ZONE = 'Africa/Nairobi';
const OFFSET = '+03:00';
export const DEFAULT_FOLLOW_UP_TIME = '09:00';

/** `2026-11-10` for the Nairobi calendar day that `value` falls on. */
export function nairobiDateOf(value: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The instant (ISO, UTC) of `date` (`YYYY-MM-DD`) at `time` (`HH:MM`) on Nairobi's clock. */
export function nairobiInstant(date: string, time = DEFAULT_FOLLOW_UP_TIME): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}

/** Tomorrow at the default follow-up time, Nairobi calendar. */
export function tomorrowFollowUp(now = new Date()): string {
  const [year = 0, month = 1, day = 1] = nairobiDateOf(now).split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return nairobiInstant(next.toISOString().slice(0, 10));
}

export const formatNairobiDateTime = (value: Date | string) =>
  new Intl.DateTimeFormat('en-KE', {
    timeZone: ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

export const formatNairobiDate = (value: Date | string) =>
  new Intl.DateTimeFormat('en-KE', {
    timeZone: ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
