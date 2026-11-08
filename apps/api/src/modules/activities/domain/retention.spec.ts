import { describe, expect, it } from 'vitest';
import { ageInMonths, isPastRetention, retentionCutoff } from './retention.js';

const at = (iso: string) => new Date(iso);

describe('retention dates', () => {
  it('counts calendar months back from now', () => {
    expect(retentionCutoff(at('2026-11-09T10:00:00Z'), 12).toISOString()).toBe(
      '2025-11-09T10:00:00.000Z',
    );
  });

  it('clamps to the end of a shorter month instead of rolling over', () => {
    expect(retentionCutoff(at('2026-03-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(retentionCutoff(at('2028-02-29T00:00:00Z'), 12).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
  });

  it('is past retention only on or after the anniversary', () => {
    const now = at('2026-11-09T10:00:00Z');
    expect(isPastRetention(at('2025-11-09T10:00:00Z'), now, 12)).toBe(true);
    expect(isPastRetention(at('2025-11-09T10:00:01Z'), now, 12)).toBe(false);
    expect(isPastRetention(at('2026-01-01T00:00:00Z'), now, 12)).toBe(false);
  });

  it('reports whole months of age', () => {
    const now = at('2026-11-09T10:00:00Z');
    expect(ageInMonths(at('2025-11-09T10:00:00Z'), now)).toBe(12);
    expect(ageInMonths(at('2025-11-09T10:00:01Z'), now)).toBe(11);
    expect(ageInMonths(at('2026-11-20T00:00:00Z'), now)).toBe(0);
  });
});
