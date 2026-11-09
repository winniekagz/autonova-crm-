import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  lineTotal,
  parseHundredths,
  parseMoney,
  percentOf,
  roundDiv,
} from './money.js';

describe('money parsing', () => {
  it('reads decimal strings exactly, with up to two decimals', () => {
    expect(parseMoney('0')).toBe(0n);
    expect(parseMoney('12')).toBe(1200n);
    expect(parseMoney('12.5')).toBe(1250n);
    expect(parseMoney('12.05')).toBe(1205n);
    expect(parseMoney('999999999999.99')).toBe(99999999999999n);
  });

  it('refuses anything that is not a plain non-negative amount', () => {
    for (const bad of [
      '',
      '-1',
      '1.234',
      '1,000',
      ' 1',
      '1e3',
      'abc',
      '.5',
      '1.',
      '0x10',
      '1000000000000000',
    ]) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });

  it('parses quantities and rates as hundredths', () => {
    expect(parseHundredths('16')).toBe(1600n);
    expect(parseHundredths('2.5')).toBe(250n);
    expect(parseHundredths('0.01')).toBe(1n);
    expect(parseHundredths('1.234')).toBeNull();
  });

  it('formats back with two decimals and never loses a cent', () => {
    expect(formatMoney(0n)).toBe('0.00');
    expect(formatMoney(5n)).toBe('0.05');
    expect(formatMoney(123450n)).toBe('1234.50');
    expect(formatMoney(99999999999999n)).toBe('999999999999.99');
  });
});

describe('rounding', () => {
  it('rounds half up and is exact where floats are not', () => {
    expect(roundDiv(5n, 2n)).toBe(3n);
    expect(roundDiv(4n, 2n)).toBe(2n);
    expect(roundDiv(1n, 3n)).toBe(0n);
    expect(roundDiv(2n, 3n)).toBe(1n);
    // 0.1 + 0.2 style traps: 16% of 0.10 is exactly 0.02 after half-up rounding (1.6 cents)
    expect(percentOf(10n, 1600n)).toBe(2n);
    // 16% of 1.03 = 0.1648, half-up to 0.16
    expect(percentOf(103n, 1600n)).toBe(16n);
    // 16% of 0.03125 style rounding boundary: 16% of 0.05 = 0.8 cent, rounds up to 1
    expect(percentOf(5n, 1600n)).toBe(1n);
  });

  it('prices a line as quantity times unit price', () => {
    expect(lineTotal(100n, 1999n)).toBe(1999n);
    expect(lineTotal(250n, 1000n)).toBe(2500n);
    expect(lineTotal(33n, 1000n)).toBe(330n);
    expect(lineTotal(1n, 1n)).toBe(0n);
    expect(lineTotal(50n, 1n)).toBe(1n);
  });
});
