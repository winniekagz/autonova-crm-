# Flow: User management (Phase 1)

**Implementation status:** 🟡 Partially implemented — invite, one-time email setup, list, view, rename, change roles, disable, and resend are implemented. Password reset, re-enable, and administrative MFA reset are not.

| Part                                                                                | State                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| First-Director bootstrap CLI                                                        | ✅                                               |
| `GET /users`, `GET /users/{id}`, `GET /roles`                                       | ✅                                               |
| `POST /users` (invite, created `INVITED`, no password)                              | ✅                                               |
| `POST /users/{id}/invitation` (send a fresh setup link)                             | ✅                                               |
| `POST /auth/invitations/accept` (set password and activate)                         | ✅                                               |
| `PATCH /users/{id}` (display name only)                                             | ✅                                               |
| `PUT /users/{id}/roles` (replace role set)                                          | ✅                                               |
| `POST /users/{id}/disable` (revokes all sessions)                                   | ✅                                               |
| Web: user list, invite form, user detail (rename, roles, disable with confirmation) | ✅                                               |
| Invitation email + accept-invitation (user sets a password)                         | ✅ SMTP; Mailpit locally; 48-hour one-time token |
| Re-enable a disabled user                                                           | ⏳ needs password reset                          |
| `POST /users/{id}/mfa/reset`                                                        | ⏳ with the MFA flow                             |
| Re-issue invitation                                                                 | ✅ for accounts still `INVITED`                  |

## Purpose

Administer who can use the system and with which roles.

## Actors and permissions

Directors only. Permissions are granular and seeded from `ROLE_PERMISSIONS` (`apps/api/src/modules/auth/domain/role-permissions.ts`, the single source of truth):

| Endpoint                      | Permission           |
| ----------------------------- | -------------------- |
| `GET /users`                  | `users:list`         |
| `GET /users/{id}`             | `users:read`         |
| `POST /users`                 | `users:create`       |
| `POST /users/{id}/invitation` | `users:create`       |
| `PATCH /users/{id}`           | `users:update`       |
| `PUT /users/{id}/roles`       | `users:assign_roles` |
| `POST /users/{id}/disable`    | `users:disable`      |
| `GET /roles`                  | `roles:list`         |

Only the Director role holds them (PRD §2.3 "Manage users and settings: Director only" is a "clear" row). The three other roles hold **no** user-administration permission. A Director whose session has not completed MFA is restricted and cannot use any of these routes (`403 MFA_REQUIRED`). Every route names its permission; a private route that declares none is refused by the guard (fail closed).

Self-service (changing your own name or password) is **not** implemented: `PATCH /users/{id}` requires `users:update`, so non-Directors cannot edit even themselves yet.

## Preconditions

Caller is authenticated, holds the permission **now** (loaded from the database on this request), and — for Directors — has a session whose MFA is verified.

## Main journey

1. A Director opens **Users** (list with search, status and role filters, server-side pagination).
2. **Invite user**: name, email, one or more roles. The account is created `INVITED` with no password. The API sends a 48-hour single-use setup link; local Compose captures it in Mailpit at `http://localhost:8025`.
3. **Accept invitation**: the recipient opens the link, chooses a password, and the account becomes `ACTIVE`. The token is stored as a hash, removed from the address bar by the web app, and consumed atomically. The recipient can then sign in and complete Director MFA if assigned that role.
4. **User detail**: rename; replace roles; resend setup email for an invited account; disable (confirmation dialog).
5. Role removal and disabling revoke every live session of the target in the same transaction. Adding a role leaves sessions alone.

## Alternative / failure paths

| Situation                                                                                              | Response                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Not permitted                                                                                          | `403 FORBIDDEN`                                                                                                  |
| Director session without MFA                                                                           | `403 MFA_REQUIRED`                                                                                               |
| Not signed in                                                                                          | `401 UNAUTHENTICATED`                                                                                            |
| Duplicate email (any casing/whitespace)                                                                | `409 EMAIL_ALREADY_REGISTERED` — decided by the database unique index, so concurrent invites cannot both succeed |
| SMTP unavailable during invite                                                                         | `503 INVITATION_EMAIL_FAILED`; account remains invited and an administrator can resend after fixing delivery     |
| Expired, revoked, or already used setup token                                                          | `400 INVITATION_INVALID` — no account activation occurs                                                          |
| Unknown / malformed role key, extra field (`status`, `password`, `permissions`, …), bad id, bad paging | `400 VALIDATION_FAILED`                                                                                          |
| Unknown user                                                                                           | `404 USER_NOT_FOUND`                                                                                             |
| Changing **your own** roles                                                                            | `422 SELF_ROLE_CHANGE_FORBIDDEN`                                                                                 |
| Disabling **yourself**                                                                                 | `422 SELF_DISABLE_FORBIDDEN`                                                                                     |
| Removing Director from / disabling the **last active Director**                                        | `422 LAST_DIRECTOR`                                                                                              |
| Empty role set                                                                                         | `422 NO_ROLES` (UI and schema also stop it earlier)                                                              |
| Disabling an already-disabled user                                                                     | `422 USER_ALREADY_DISABLED`                                                                                      |
| Audit write fails                                                                                      | `500`; the change **and** any session revocation roll back                                                       |

## Business rules and decisions made in this slice

- **Initial status is always `INVITED`; the caller cannot choose it** (and cannot set a password). The lifecycle is invitation → user sets own password → `ACTIVE`. The database forbids `ACTIVE` without a password.
- **Nobody changes their own roles** — up or down. _Decision (doc 06 asked for a defined self-role policy):_ privilege changes need a second Director, so no one can escalate themselves and a lone Director cannot demote themselves.
- **Last-Director protection** counts only _active_ Directors (an invited or disabled Director cannot administer anything). It runs under a Postgres advisory lock shared with the bootstrap, so two concurrent demotions/disables cannot both pass the check (tested with forced overlap).
- **A single actor can never trigger `LAST_DIRECTOR`** (the actor is an active Director and may not target themselves); it protects against two Directors acting at the same time, and against future flows (e.g. MFA reset, imports).
- **`INVITED → DISABLED` is allowed**, to cancel a mistaken invitation, because users are never deleted.
- **Re-enable is not implemented**: doc 06 requires a fresh password reset first.
- **Removing a role revokes sessions** (doc 06); **adding** one does not.
- **Promotion to Director grants nothing immediately**: the new Director session is restricted until MFA, so the earlier session is revoked and the next login is gated.
- Email is the sign-in identity and is **not editable** here; roles and status have their own audited actions; **only `fullName` is editable via `PATCH`**.
- No-op updates (same name, same roles) write no audit row.

## Data affected

`users`, `user_roles`, `sessions` (revocation), `audit_logs`. No schema change was needed. `permissions` and `role_permissions` are now seeded (7 grants, all Director).

## Audit

All in the same transaction as the change; actor, target, allow-listed old/new values, reason where supplied: `user.created`, `user.updated` (old/new name), `user.roles_changed` (old/new roles, `sessionsRevoked`, reason), `user.disabled` (old/new status, `sessionsRevoked`, reason). No password, hash, token or secret can be written (the audit service refuses credential-looking keys, and user queries never select `passwordHash`).

## Validation

`emailSchema` (trim, lower-case), `fullNameSchema` (1–120, no control characters), role keys from the closed `SystemRoleKey` set and resolved against the database, `reasonSchema` (≤500), `uuidSchema` for ids, paging capped at 100. All bodies are `.strict()`.

## State transitions

`INVITED → ACTIVE` (one-time email invitation acceptance) · `INVITED | ACTIVE → DISABLED` (built) · `DISABLED → …` (not built).

## Acceptance criteria and test coverage

Met and tested: only authorised Directors manage users · MFA-restricted Directors blocked · every change audited atomically · disabled users cannot sign in and their live tokens stop working · role changes take effect on the next request · last Director protected under concurrency · self-escalation impossible · no credential in any response · mass assignment rejected · duplicate email decided by the database. See `apps/api/test/users.e2e-spec.ts` (44 tests), `apps/web/src/features/users/*.spec.tsx`.

## Open questions

- S3 email provider (blocks invitations, so blocks anyone actually signing in).
- Should non-Directors be able to edit their own name/password (self-service profile)? Not in the PRD; not built.
- Should a Director be able to hold other roles at the same time (current rule: allowed)?
- Whether disabling should also be possible with a mandatory reason (currently optional, audited when given).
