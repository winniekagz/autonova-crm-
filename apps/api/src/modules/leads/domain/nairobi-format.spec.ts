import { describe, expect, it } from 'vitest';
import { formatNairobiDateTime } from './nairobi-business-date.js';

describe('formatNairobiDateTime', () => {
  it('shows Nairobi wall-clock time (UTC+3), not the host timezone', () => {
    expect(formatNairobiDateTime(new Date('2026-11-10T06:00:00.000Z'))).toMatch(
      /10 Nov 2026.*09:00/,
    );
  });
  it('rolls into the next Nairobi day after 21:00 UTC', () => {
    expect(formatNairobiDateTime(new Date('2026-11-10T22:30:00.000Z'))).toMatch(
      /11 Nov 2026.*01:30/,
    );
  });
});
