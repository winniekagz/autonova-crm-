# Flow: Authentication (Phase 1)

**Implementation status:** 🟢 Login, persistent sessions, Director TOTP enrollment/verification/recovery, and email invitations with one-time password setup are implemented. Password reset and administrative MFA reset remain unimplemented.

| Part                                                                                               | State                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Login (`POST /auth/login`), `GET /auth/me`, `POST /auth/logout`                                    | ✅ verified (58 API e2e tests, mutation-checked; manual browser run) |
| Access tokens (HS256, claims `sub`,`sid`,`iat`,`exp` only; algorithm pinned)                       | ✅                                                                   |
| Per-request user + session + live role/permission check; global deny-by-default guard; `@Public()` | ✅                                                                   |
| Restricted sessions for roles requiring MFA (Directors)                                            | ✅ database-backed gate until verified                               |
| Login failure parity, timing equalisation, rehash-on-login, login rate limit (10/min/IP)           | ✅                                                                   |
| Web login page, in-memory token, sign out                                                          | ✅                                                                   |
| Refresh-token rotation + replay detection, HttpOnly cookie, CSRF (Origin + custom header)          | ✅                                                                   |
| Persistent login: a reload restores the session; silent refresh; multi-tab coordination            | ✅                                                                   |
| Own sessions list/revoke (API + `/sessions` page)                                                  | ✅                                                                   |
| TOTP enrollment, confirmation, login verification and recovery codes                               | ✅; recovery resets enrollment and all sessions must re-enroll       |
| Email invitations, one-time password setup, and resend                                             | ✅ 48-hour links; provider-neutral SMTP with local Mailpit           |
| Administrative MFA reset and password reset                                                        | ⏳ not implemented                                                   |
| Per-email login throttling, session idle timeout                                                   | ⏳                                                                   |

## Purpose

Let active users prove who they are, keep a session safely, and end or revoke it. Authentication answers _who_; [authorization](authorization.md) answers _what they may do_.

## Actors and permissions

Any user with an `ACTIVE` account. Public endpoints: login, refresh, and invitation acceptance. Everything else requires a valid access token.

## Preconditions

User exists, `status = ACTIVE`, password set. System roles seeded ✅. First Director created by a one-time bootstrap command (no default credentials).

## Main journey

1. `POST /auth/login` {email, password} → access token (body) + refresh cookie. A Director session remains restricted in the database. An unenrolled Director starts enrollment (`POST /auth/mfa/enrollment`) and confirms it (`POST /auth/mfa/enrollment/confirm`); the API returns recovery codes once. An enrolled Director verifies each new session with `POST /auth/mfa/verify`.
2. Web keeps the access token in memory; calls API with `Authorization: Bearer`. On **every** request the API checks user ACTIVE + session not revoked and loads current roles/permissions (token claims: `sub`, `sid`, `iat`, `exp` only).
3. **Reload:** the page starts with no token, calls `POST /auth/refresh` (HttpOnly cookie + `X-Autonova-CSRF` header), gets a new access token and a **rotated** cookie, loads `/auth/me`, and continues. While this runs the app shows "Checking your session…" and renders nothing user-specific.
   **Expiry:** the client renews the token ~30 s before it expires, or on `401 TOKEN_EXPIRED`; refreshes are single-flight per tab and serialised across tabs with the Web Locks API; the original request is retried **once** (safe: `TOKEN_EXPIRED` is answered before any handler runs).
4. `GET /auth/me` returns profile, roles and effective permissions.
5. `POST /auth/logout` revokes the session (and so all its refresh tokens) and clears the cookie; the web client clears its state first and never refreshes afterwards.
6. `GET /auth/sessions` lists the caller's live sessions; `DELETE /auth/sessions/{id}` revokes one of them.

## Alternative / failure paths

- Wrong email or password → 401 `INVALID_CREDENTIALS` (same response and similar timing whether the email exists).
- User `INVITED` or `DISABLED` → 401 (same generic response; the reason is audited, not disclosed).
- Too many attempts → 429 `RATE_LIMITED`.
- Refresh token reused after rotation → the session (= token family) is revoked, 401 `REFRESH_TOKEN_INVALID`, audit `auth.refresh_reuse_detected`. **No grace period** (see 06).
- Wrong/replayed TOTP code → 401 `MFA_CODE_INVALID`; five persistent failures lock MFA for 15 minutes. A recovery code is accepted once, clears enrollment and returns all sessions to restricted status until re-enrolled.
- Disabled user holding a valid access token → next request 401 (session revoked + status check).
- Refresh with a missing, unknown, expired or revoked token, a revoked/expired session or a disabled user → the same 401 `REFRESH_TOKEN_INVALID` and the cookie is cleared. Without an allowed Origin or the custom header → 403 `CSRF_REJECTED` (cookie untouched).
- Network/5xx while restoring the session on reload → the web app says it could not check the session and offers **Try again**; it does not sign the user out.
- `403 MFA_REQUIRED` / `403 FORBIDDEN` are never treated as an expired token: no refresh, no retry, no sign-out.
- Password reset: request always returns 202; confirm with valid single-use token sets a new password and revokes all sessions.

## Business rules

Password rules, token lifetimes, MFA and rotation rules per [06](../06-security-and-access-control.md). Refresh tokens stored only as SHA-256 hashes; rotation is a single atomic conditional UPDATE. Disable, password change/reset, MFA reset and role removal revoke all sessions. Director TOTP is mandatory and cannot be disabled by configuration.

## Data affected

`users` ✅; `user_invitations` ✅ (SHA-256 token hashes, 48-hour expiry, one-time acceptance); `sessions` ✅; `refresh_tokens` ✅; `user_mfa` ✅ (AES-256-GCM ciphertext/IV/tag, replay step and failure lock); `mfa_recovery_codes` ✅ (SHA-256 digest, one-time use); `audit_logs` ✅. Password-reset-token persistence remains planned.

## API endpoints

✅ `POST /auth/login` · `POST /auth/invitations/accept` · `GET /auth/mfa/status` · `POST /auth/mfa/enrollment` · `POST /auth/mfa/enrollment/confirm` · `POST /auth/mfa/verify` · `POST /auth/mfa/recover` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `GET /auth/sessions` · `DELETE /auth/sessions/{id}` · ⏳ password-reset endpoints

## Validation

Email via `emailSchema` (trim + lowercase); password length 12–128 with shared password checks; invitation token is 32 random bytes encoded base64url.

## State transitions

Session: `active → revoked | expired`. Refresh token: `issued → used (rotated) | revoked | expired`. Invitation: `issued → accepted | expired | revoked`. Director MFA: `not_enrolled → enrolled(verified)`; recovery returns to `not_enrolled`.

## Acceptance criteria

Unauthenticated → 401 on protected routes · expired access token handled · refresh rotation works and **concurrent refresh yields exactly one successor** · revoked sessions unusable · reuse detection revokes family · disabled user's still-valid JWT rejected on the next request · stale-role token carries no authority · Director cannot reach the app without TOTP · MFA replay/lockout/recovery work · invitation acceptance activates an invited user · invitation expires and is single-use · all audited · no secret in logs/responses.

## Test scenarios

Login success/failure parity · throttle · access expiry (injected clock) · rotation chain · reuse detection · **race test: N parallel refreshes with one token** · logout revocation · disable-user revocation · role-change effect on next request · MFA enrollment/verify/replay/lockout/recovery · invite email delivery, acceptance, expiry, replay, and resend · CSRF header + Origin check · cookie flags and path · no `passwordHash`, token or secret in any response or log.

## Open questions

Production email provider and sender domain (S3) · session idle/absolute lifetime (S6, defaults proposed in 06). Local development uses Mailpit. _(Director MFA timing is now decided: Phase 1, mandatory.)_
