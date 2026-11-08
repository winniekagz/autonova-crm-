import { ApiError } from '@/lib/api-client';

/** Messages are chosen by error `code`, never copied from the server, so wording stays consistent. */
const MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: 'A user with this email address already exists.',
  INVITATION_EMAIL_FAILED:
    'The account was created, but the email could not be delivered. Find the invited account and resend its setup email after checking SMTP configuration.',
  INVITATION_NOT_AVAILABLE: 'This account is no longer waiting for invitation acceptance.',
  FORBIDDEN: 'You do not have permission to do this.',
  MFA_REQUIRED: 'Verify your second factor before managing users.',
  USER_NOT_FOUND: 'This user no longer exists.',
  UNKNOWN_ROLE: 'One of the selected roles is not available.',
  SELF_ROLE_CHANGE_FORBIDDEN: 'You cannot change your own roles. Ask another Director to do it.',
  SELF_DISABLE_FORBIDDEN: 'You cannot disable your own account. Ask another Director to do it.',
  LAST_DIRECTOR:
    'This would leave the system without an active Director. Make another user an active Director first.',
  NO_ROLES: 'A user must hold at least one role.',
  USER_ALREADY_DISABLED: 'This user is already disabled.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
};

export function userErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known = MESSAGES[error.code];
    if (known) return known;
    if (error.code === 'NETWORK_ERROR') return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function isDuplicateEmail(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED';
}

export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.code === 'FORBIDDEN');
}
