/** Contact emails are stored lower-case; the database enforces it too. */
export const normalizeEmail = (raw: string | null | undefined): string | null => {
  const value = (raw ?? '').trim().toLowerCase();
  return value === '' ? null : value;
};

/** Blank optional text becomes null so the database never holds empty strings. */
export const textOrNull = (raw: string | null | undefined): string | null => {
  const value = (raw ?? '').trim();
  return value === '' ? null : value;
};
