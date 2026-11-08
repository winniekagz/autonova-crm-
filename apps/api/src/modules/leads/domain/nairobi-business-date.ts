/** Return the calendar date used by the Nairobi sales team, independent of the host timezone. */
export function nairobiBusinessDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/** Prisma maps @db.Date through Date; UTC midnight preserves the selected calendar date. */
export function prismaDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
