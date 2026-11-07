# Flow: Authentication (Phase 1)

**Implementation status:** 🟡 Partially implemented.

| Part                                                                                               | State                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Login (`POST /auth/login`), `GET /auth/me`, `POST /auth/logout`                                    | ✅ verified (58 API e2e tests, mutation-checked; manual browser run) |
| Access tokens (HS256, claims `sub`,`sid`,`iat`,`exp` only; algorithm pinned)                       | ✅                                                                   |
| Per-request user + session + live role/permission check; global deny-by-default guard; `@Public()` | ✅                                                                   |
| Restricted sessions for roles requiring MFA (Directors)                                            | ✅ gating only — the MFA endpoints themselves are ⏳                 |
| Login failure parity, timing equalisation, rehash-on-login, login rate limit (10/min/IP)           | ✅                                                                   |
| Web login page, in-memory token, sign out                                                          | ✅                                                                   |
| Refresh-token rotation + replay detection, HttpOnly cookie, CSRF (Origin + custom header)          | ✅                                                                   |
| Persistent login: a reload restores the session; silent refresh; multi-tab coordination            | ✅                                                                   |
| Own sessions list/revoke (API + `/sessions` page)                                                  | ✅                                                                   |
| MFA endpoints, password reset, invitations                                                         | ⏳ not started                                                       |
| Per-email login throttling, session idle timeout                                                   | ⏳                                                                   |

## Purpose

Let active users prove who they are, keep a session safely, and end or revoke it. Authentication answers _who_; [authorization](authorization.md) answers _what they may do_.

## Actors and permissions

Any user with an `ACTIVE` account. Public endpoints: login, refresh, password-reset request/confirm. Everything else requires a valid access token.

## Preconditions

User exists, `status = ACTIVE`, password set. System roles seeded ✅. First Director created by a one-time bootstrap command (no default credentials).

## Main journey

1. `POST /auth/login` {email, password} → for non-Directors: access token (body) + refresh cookie. For Directors: a 5-minute `mfa_pending` credential (not an access token), then `POST /auth/mfa/verify` {code} → access token + refresh cookie. A Director without verified TOTP is forced through enrolment first (`/auth/mfa/enroll`, `/auth/mfa/enroll/verify`).
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
- Wrong/replayed TOTP code → 401 `INVALID_MFA_CODE`; 5 failures per 15 min locks MFA temporarily. Recovery code accepted once.
- Disabled user holding a valid access token → next request 401 (session revoked + status check).
- Refresh with a missing, unknown, expired or revoked token, a revoked/expired session or a disabled user → the same 401 `REFRESH_TOKEN_INVALID` and the cookie is cleared. Without an allowed Origin or the custom header → 403 `CSRF_REJECTED` (cookie untouched).
- Network/5xx while restoring the session on reload → the web app says it could not check the session and offers **Try again**; it does not sign the user out.
- `403 MFA_REQUIRED` / `403 FORBIDDEN` are never treated as an expired token: no refresh, no retry, no sign-out.
- Password reset: request always returns 202; confirm with valid single-use token sets a new password and revokes all sessions.

## Business rules

Password rules, token lifetimes, MFA and rotation rules per [06](../06-security-and-access-control.md). Refresh tokens stored only as SHA-256 hashes; rotation is a single atomic conditional UPDATE. Disable, password change/reset, MFA reset and role removal revoke all sessions. Director TOTP is mandatory and cannot be disabled by configuration.

## Data affected

`users` (last_login_at) ✅; `sessions` ✅ (id, user_id, created_at, expires_at, revoked_at, revoked_reason, mfa_verified_at, ip, user_agent); `refresh_tokens` ✅ (id, session_id FK, token_hash UNIQUE, created_at, expires_at, used_at; the session is the token family, see 06); still planned: `one_time_tokens` (purpose INVITE/RESET, hash UNIQUE, user_id, expires_at, used_at), `user_mfa` (user_id, encrypted_secret, key_version, verified_at, last_used_step), `mfa_recovery_codes` (user_id, code_hash, used_at); `audit_logs` ✅ (+ `category` column); separate `autonova_migrator` / `autonova_app` DB roles.

## API endpoints (planned)

✅ `POST /auth/login` · ⏳ `POST /auth/mfa/verify` · `POST /auth/mfa/enroll` · `POST /auth/mfa/enroll/verify` · ✅ `POST /auth/refresh` · ✅ `POST /auth/logout` · ✅ `GET /auth/me` · ✅ `GET /auth/sessions` · ✅ `DELETE /auth/sessions/{id}` · `POST /auth/password-reset/request` · `POST /auth/password-reset/confirm` · `POST /auth/invitations/accept`

## Validation

Email via `emailSchema` (trim + lowercase); password length 12–128; reset token fixed-format string.

## State transitions

Session: `active → revoked | expired`. Refresh token: `issued → used (rotated) | revoked | expired`. One-time token: `issued → used | expired | superseded`. Director MFA: `not_enrolled → enrolled(verified)`; reset returns to `not_enrolled`.

## Acceptance criteria

Unauthenticated → 401 on protected routes · expired access token handled · refresh rotation works and **concurrent refresh yields exactly one successor** · revoked sessions unusable · reuse detection revokes family · disabled user's still-valid JWT rejected on the next request · stale-role token carries no authority · Director cannot reach the app without TOTP · MFA replay/lockout/recovery work · all audited · no secret in logs/responses.

## Test scenarios

Login success/failure parity · throttle · access expiry (injected clock) · rotation chain · reuse detection · **race test: N parallel refreshes with one token** · grace window · logout revocation · disable-user revocation · role-change effect on next request · MFA enrol/verify/replay/lockout/recovery/reset · CSRF header + Origin check · reset single-use, expiry, supersession · cookie flags and path · no `passwordHash`, token or secret in any response or log.

## Open questions

Email provider (S3) · session idle/absolute lifetime (S6, defaults proposed in 06). _(Director MFA timing is now decided: Phase 1, mandatory.)_
