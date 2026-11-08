import { ActivityType } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import {
  FUTURE_TOLERANCE_MS,
  MAX_ATTENDEES,
  attendeeNameKey,
  canModifyActivity,
  roundCoordinate,
  validateActivity,
} from './activity-rules.js';

const now = new Date('2026-11-08T12:00:00.000Z');
const base = {
  type: ActivityType.Visit,
  occurredAt: new Date('2026-11-08T07:00:00.000Z'),
  gps: null,
  attendeeKeys: [] as string[],
  now,
};

describe('validateActivity', () => {
  it('accepts a report about something that already happened, however long ago', () => {
    expect(validateActivity(base)).toEqual({ ok: true });
    expect(validateActivity({ ...base, occurredAt: new Date('2024-01-01T00:00:00.000Z') })).toEqual(
      { ok: true },
    );
  });

  it('refuses the future, with a small allowance for a phone clock that runs ahead', () => {
    const later = (ms: number) => ({ ...base, occurredAt: new Date(now.getTime() + ms) });
    expect(validateActivity(later(FUTURE_TOLERANCE_MS))).toEqual({ ok: true });
    expect(validateActivity(later(FUTURE_TOLERANCE_MS + 1))).toEqual({
      ok: false,
      code: 'OCCURRED_IN_FUTURE',
    });
  });

  it('allows a GPS check-in only on a site visit and only for real coordinates', () => {
    const gps = { latitude: -1.286389, longitude: 36.817223 };
    expect(validateActivity({ ...base, gps })).toEqual({ ok: true });
    for (const type of [ActivityType.Call, ActivityType.Demo, ActivityType.Meeting]) {
      expect(validateActivity({ ...base, type, gps })).toEqual({
        ok: false,
        code: 'GPS_ONLY_FOR_VISITS',
      });
    }
    for (const bad of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: Number.NaN, longitude: 0 },
    ]) {
      expect(validateActivity({ ...base, gps: bad })).toEqual({
        ok: false,
        code: 'GPS_OUT_OF_RANGE',
      });
    }
  });

  it('caps attendees and refuses the same attendee twice', () => {
    const many = Array.from({ length: MAX_ATTENDEES + 1 }, (_, i) => `contact:${i}`);
    expect(validateActivity({ ...base, attendeeKeys: many })).toEqual({
      ok: false,
      code: 'TOO_MANY_ATTENDEES',
    });
    expect(validateActivity({ ...base, attendeeKeys: ['contact:1', 'contact:1'] })).toEqual({
      ok: false,
      code: 'DUPLICATE_ATTENDEE',
    });
    expect(validateActivity({ ...base, attendeeKeys: ['contact:1', 'contact:2'] })).toEqual({
      ok: true,
    });
  });
});

describe('canModifyActivity', () => {
  it('lets the creator and any Director change a report, and nobody else', () => {
    const activity = { createdByUserId: 'u1' };
    expect(canModifyActivity({ id: 'u1', isDirector: false }, activity)).toBe(true);
    expect(canModifyActivity({ id: 'u2', isDirector: true }, activity)).toBe(true);
    expect(canModifyActivity({ id: 'u2', isDirector: false }, activity)).toBe(false);
  });
});

describe('helpers', () => {
  it('rounds coordinates to six decimals', () => {
    expect(roundCoordinate(-1.28638912345)).toBe(-1.286389);
    expect(roundCoordinate(36.8172236)).toBe(36.817224);
  });
  it('treats an outside attendee as the same person regardless of case and spacing', () => {
    expect(attendeeNameKey('  Jane   Doe ', 'Acme')).toBe(attendeeNameKey('jane doe', ' ACME '));
    expect(attendeeNameKey('Jane Doe', 'Acme')).not.toBe(attendeeNameKey('Jane Doe', 'Other'));
  });
});
