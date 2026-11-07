# ADR-003: JWT access tokens with rotating refresh tokens

**Status:** Accepted (design) · implementation in Phase 1

## Context

Browser SPA-style frontend plus REST API; need revocation, short exposure windows, and protection against token theft. Roles can change while a user is signed in.

## Decision

Short-lived JWT access tokens (~15 min) held in memory with claims limited to `sub`, `sid`, `iat`, `exp`; opaque refresh tokens (hashed in the DB) in an HttpOnly, Secure, SameSite cookie, **rotated atomically on every use** with token-family reuse detection. On **every protected request** the API loads the user (must be ACTIVE), the session (not revoked) and the **current** roles/permissions, so revocation, disablement and role changes apply immediately (no cache in Phase 1). Directors additionally require TOTP MFA. Revised 2026-11-07 after security review (roles removed from the token; MFA made mandatory).

## Alternatives considered

- Server-side sessions only — simple revocation, but the directive specifies JWT.
- Long-lived JWTs — rejected: no revocation.
- Roles or permissions inside the JWT — rejected: stale until expiry after a role change or disablement.
- Stateless access tokens with no per-request status check — rejected: a disabled user's JWT would stay valid up to 15 minutes.

## Consequences

One extra indexed query per request (user + session + roles); a short, explicitly-evicted cache is allowed only if measurement shows a need. CSRF defences needed on the refresh/logout endpoints because of the cookie. Details, including MFA, rotation races and the concurrent-refresh grace window, in [06](../06-security-and-access-control.md).
