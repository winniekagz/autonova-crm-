import { z } from 'zod';

/**
 * Lengths of the two kinds of code this form accepts. They are deliberately lenient: the server is
 * the only judge of whether a code is right, and wrong guesses count against a lockout. The form
 * only refuses input that cannot possibly be a code, so no attempt is wasted on it.
 */
export const AUTHENTICATOR_CODE_LENGTH = 6;
export const RECOVERY_CODE_MIN_LENGTH = 32;
export const RECOVERY_CODE_MAX_LENGTH = 39;

export const authenticatorCodeSchema = z.object({
  code: z.string().length(AUTHENTICATOR_CODE_LENGTH),
});

export const recoveryCodeSchema = z.object({
  code: z.string().min(RECOVERY_CODE_MIN_LENGTH).max(RECOVERY_CODE_MAX_LENGTH),
});

export type MfaCodeValues = z.input<typeof authenticatorCodeSchema>;
