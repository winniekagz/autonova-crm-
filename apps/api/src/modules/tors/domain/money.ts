/**
 * Exact decimal arithmetic for commercial documents. Amounts are held as integer minor units (cents) in
 * BigInt, so no floating point error can reach a price. Rounding is half-up, applied once per computed
 * figure (never on a running total), and only on the figures the document shows.
 */
const MONEY = /^\d{1,12}(?:\.\d{1,2})?$/;
const HUNDREDTHS = /^\d{1,6}(?:\.\d{1,2})?$/;

export type Cents = bigint;
export type Hundredths = bigint;

function toScaled(value: string, pattern: RegExp): bigint | null {
  if (!pattern.test(value)) return null;
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** "1234.5" to 123450n; null when it is not a non-negative amount with up to two decimals. */
export const parseMoney = (value: string): Cents | null => toScaled(value, MONEY);

/** Quantities, days and percentages: up to two decimals, as hundredths. */
export const parseHundredths = (value: string): Hundredths | null => toScaled(value, HUNDREDTHS);

const format = (scaled: bigint): string => {
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${fraction}`;
};
export const formatMoney = (cents: Cents): string => format(cents);
export const formatHundredths = (value: Hundredths): string => format(value);

/** n / d rounded half-up, for non-negative integers. */
export const roundDiv = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

/** quantity (hundredths) times a unit price (cents), in cents. */
export const lineTotal = (quantity: Hundredths, unitPrice: Cents): Cents =>
  roundDiv(quantity * unitPrice, 100n);

/** A percentage (hundredths of a percent, so 16.00 is 1600n) of an amount in cents. */
export const percentOf = (amount: Cents, percent: Hundredths): Cents =>
  roundDiv(amount * percent, 10000n);

export const sum = (values: readonly bigint[]): bigint => values.reduce((a, b) => a + b, 0n);
