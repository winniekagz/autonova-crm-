/** What a controller or policy learns about the caller. Built from the database on every request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  sessionId: string;
  /** Current role keys (never taken from the token). */
  roles: string[];
  /** Current effective permission keys (union over roles). */
  permissions: string[];
  /** True once the second factor was verified for this session. */
  mfaVerified: boolean;
  /** True when this user's roles require MFA (Directors). Their session is restricted until verified. */
  mfaRequired: boolean;
}
