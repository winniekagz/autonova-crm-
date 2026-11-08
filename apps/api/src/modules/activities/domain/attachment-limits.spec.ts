import { describe, expect, it } from 'vitest';
import { attachmentLimitsFrom, fitsTotal, largestFileBytes } from './attachment-limits.js';

const limits = attachmentLimitsFrom({ photoMb: 10, documentMb: 25, voiceNoteMb: 20, totalMb: 50 });
const MB = 1024 * 1024;

describe('attachment limits', () => {
  it('turns the configured megabytes into per-category bytes', () => {
    expect(limits.perFileBytes).toEqual({
      PHOTO: 10 * MB,
      DOCUMENT: 25 * MB,
      VOICE_NOTE: 20 * MB,
    });
    expect(limits.totalBytes).toBe(50 * MB);
  });

  it('accepts fractional megabytes', () => {
    expect(
      attachmentLimitsFrom({ photoMb: 0.5, documentMb: 1, voiceNoteMb: 1, totalMb: 2 }).perFileBytes
        .PHOTO,
    ).toBe(512 * 1024);
  });

  it('caps the request at the largest single file', () => {
    expect(largestFileBytes(limits)).toBe(25 * MB);
  });

  it('allows a file that exactly reaches the total and refuses one byte more', () => {
    expect(fitsTotal(limits, 30 * MB, 20 * MB)).toBe(true);
    expect(fitsTotal(limits, 30 * MB, 20 * MB + 1)).toBe(false);
    expect(fitsTotal(limits, 0, 1)).toBe(true);
  });
});
