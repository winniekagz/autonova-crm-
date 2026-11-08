import { describe, expect, it } from 'vitest';
import {
  formatNairobiDate,
  formatNairobiDateTime,
  nairobiDateOf,
  nairobiInstant,
  tomorrowFollowUp,
} from './nairobi-time';

describe('nairobi time', () => {
  it('reads the Nairobi calendar day, not the UTC day', () => {
    expect(nairobiDateOf('2026-11-10T20:59:59.000Z')).toBe('2026-11-10');
    expect(nairobiDateOf('2026-11-10T21:00:00.000Z')).toBe('2026-11-11');
  });

  it('turns a chosen date into 09:00 Nairobi time by default', () => {
    expect(nairobiInstant('2026-11-10')).toBe('2026-11-10T06:00:00.000Z');
    expect(nairobiInstant('2026-11-10', '23:30')).toBe('2026-11-10T20:30:00.000Z');
  });

  it('round-trips a date through an instant', () => {
    expect(nairobiDateOf(nairobiInstant('2027-02-28'))).toBe('2027-02-28');
  });

  it('defaults to tomorrow 09:00 Nairobi, including across a month end and late evenings', () => {
    expect(tomorrowFollowUp(new Date('2026-11-07T10:00:00.000Z'))).toBe('2026-11-08T06:00:00.000Z');
    expect(tomorrowFollowUp(new Date('2026-11-30T21:30:00.000Z'))).toBe('2026-12-02T06:00:00.000Z');
    expect(tomorrowFollowUp(new Date('2026-12-31T10:00:00.000Z'))).toBe('2027-01-01T06:00:00.000Z');
  });

  it('formats in Nairobi time whatever the host timezone', () => {
    expect(formatNairobiDateTime('2026-11-10T06:00:00.000Z')).toMatch(/10 Nov 2026.*09:00/);
    expect(formatNairobiDate('2026-11-10T22:00:00.000Z')).toBe('11 Nov 2026');
  });
});
