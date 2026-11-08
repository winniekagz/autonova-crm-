import { describe, expect, it } from 'vitest';
import { nairobiBusinessDate, prismaDateOnly } from './nairobi-business-date.js';

describe('Nairobi business date', () => {
  it('uses the Nairobi calendar day even when UTC is still on the prior date', () => {
    expect(nairobiBusinessDate(new Date('2026-11-09T21:30:00.000Z'))).toBe('2026-11-10');
  });

  it('does not mark the next Nairobi date due before its local midnight', () => {
    expect(nairobiBusinessDate(new Date('2026-11-09T20:59:59.999Z'))).toBe('2026-11-09');
    expect(nairobiBusinessDate(new Date('2026-11-09T21:00:00.000Z'))).toBe('2026-11-10');
  });

  it('round trips a date-only value through Prisma Date without host-timezone arithmetic', () => {
    expect(prismaDateOnly('2026-11-10').toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });
});
