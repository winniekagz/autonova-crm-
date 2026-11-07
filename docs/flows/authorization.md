# Flow: Authorization (Phase 1)

**Implementation status:** 🟡 Partially implemented. ✅ Permission model: `@RequirePermission` / `@AnyAuthenticatedUser`, fail-closed guard, database-seeded grants, live permission lookup per request, applied to user administration. ⏳ Resource-ownership policies (leads etc.), role/permission administration endpoints, permission cache (deliberately none).

## Purpose

Decide what an authenticated user may do, and to which records. Enforced by the API; the UI only mirrors it.

## Actors and permissions

All authenticated users are subject to it. Only Directors can change role/permission assignments (`users:assign_roles`, `users:disable`).

## Preconditions

Authenticated request (user id + roles from the access token; permissions resolved server-side).

## Main journey

1. Route declares a required permission via decorator; global guard denies by default (`@Public()` opts out).
2. Guard validates user ACTIVE and session not revoked, then resolves the caller's **current** permission set (union over current roles; nothing is trusted from the token except `sub`/`sid`).
3. Use case loads the resource and applies the **resource policy** (ownership, state, e.g. "ToR signed ⇒ read-only").
4. Sensitive actions write an audit event.

## Alternative / failure paths

Missing permission → 403 `FORBIDDEN`. Record exists but caller may not see it → 404. Override without reason → 422 `REASON_REQUIRED`. Attempt to modify a signed ToR (any role, including Director) → 422 `TOR_SIGNED_IMMUTABLE`.

## Business rules

See the matrix and rules in [06](../06-security-and-access-control.md): BD owns their leads (access follows the current owner; reassignment audited, history preserved); Technical Lead reviews scope/estimates; Finance cannot change scope; Director approves discounts over threshold and may override qualification **with a recorded reason**. **No wildcard override**: explicit permissions only (`qualification:override`, `discounts:approve`, `leads:reassign`, `users:disable`, `users:reset_mfa`, `sessions:revoke`).

## Data affected

`roles`, `permissions`, `role_permissions`, `user_roles` ✅ (tables exist; permissions not yet seeded), `audit_logs` ✅.

## API endpoints (planned)

`GET /roles` · `GET /roles/{id}` · `PUT /roles/{id}/permissions` · `PUT /users/{id}/roles` · `GET /permissions` · `DELETE /users/{id}/sessions` (revoke all)

## Validation

Role key and permission key formats (also enforced by DB CHECK ✅). System roles cannot be deleted or re-keyed.

## State transitions

None (configuration). Every change audited with old/new.

## Acceptance criteria

Users cannot act beyond their permissions · IDOR attempts return 404 · override requires reason · permission/role changes take effect on the next request (no cache) · role removal revokes sessions · routes are private by default (test enumerates routes) · no wildcard permissions exist.

## Test scenarios

Per role × sensitive action matrix test · IDOR on `/:id` · list endpoints never leak other owners' rows · public-route allow-list test · reason-required · permission change visible next request · stale-role JWT · self-privilege-escalation attempt · cannot remove/MFA-reset the last Director.

## Open questions

S1 in [06](../06-security-and-access-control.md#open-security-decisions): all "Confirm" cells and record-visibility questions — must be answered before those rows are seeded. Phase 1 seeds only the "clear" rows.
