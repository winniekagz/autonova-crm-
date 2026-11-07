# 06 — Security and access control

**Version:** 0.2 (revised after security review, 2026-11-07) · **Status:** implementation-ready design for roadmap Phase 1; nothing below is implemented unless marked ✅ (verified by a test that was run). Implemented so far: DB role split, audit service, argon2id hashing + password policy, first-Director bootstrap, login/logout/`me` with per-request session validation, deny-by-default guard, restricted Director sessions, **permission model (`@RequirePermission`, seeded grants) and user administration**.
**Decision labels:** **Decided** = required by the PRD/directive or an engineering decision recorded here · **Proposed** = engineering default awaiting stakeholder approval (change is cheap) · **Open** = needs a business answer, tracked in [Open security decisions](#open-security-decisions).

## Phase placement of security controls

The PRD's "Phase 1" (Pipeline: leads, visit reports with attachments, ToR, basic e-signature) spans roadmap phases 1–6. Controls are specified here **now**, but each is built in the roadmap phase where the feature it protects first exists. A feature must not ship without its controls.

| Control                                                                                 | Built in roadmap phase                                                          | Gate                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Provisioning, passwords, access/refresh tokens, sessions, MFA, reset, rate limiting     | **1**                                                                           | —                                                   |
| Roles, permissions, deny-by-default guard, ownership policies, role-change invalidation | **1**                                                                           | —                                                   |
| Audit service, security events, DB roles, secrets validation, CORS/cookies              | **1**                                                                           | —                                                   |
| Backups: encrypted daily, 30-day retention, tested restore                              | **before any real client data is entered** (infra task; target: end of Phase 1) | PRD §8.4                                            |
| File upload/download security                                                           | **3** (first attachment: visit reports)                                         | No upload endpoint ships without §File security     |
| External ToR signing security                                                           | **5**                                                                           | No signing link ships without §External ToR signing |
| Audit events for each business module                                                   | with that module (table below)                                                  | No critical mutation ships without its audit event  |

## Review disposition (v0.1 → v0.2)

| Review item                 | Outcome                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Director MFA             | **Accepted.** Mandatory TOTP in Phase 1 (was "open").                                                                                                                                                           |
| B. Access-token revocation  | **Accepted.** Every request checks user + session status; no cache in Phase 1 → zero revocation delay.                                                                                                          |
| C. Roles in JWT             | **Accepted.** Claims reduced to `sub`, `sid`, `iat`, `exp`.                                                                                                                                                     |
| D. Ownership vs permission  | **Accepted** as Proposed defaults pending sign-off.                                                                                                                                                             |
| E. `*:override_*` wildcard  | **Accepted.** Removed; explicit permissions only.                                                                                                                                                               |
| F. Audit coverage           | **Accepted.** Per-module coverage table, security-event rules, DB privileges. _Note:_ TRUNCATE was already blocked by a separate statement-level trigger (tested ✅); the gap was DB privileges, now specified. |
| G. File security in Phase 1 | **Accepted in substance, not in timing.** Specified now; built in roadmap Phase 3 when the first upload endpoint exists (the review read the PRD's Phase 1 as roadmap Phase 1).                                 |
| H. ToR signing security     | **Accepted**; built in roadmap Phase 5.                                                                                                                                                                         |
| Backup/privacy/provisioning | **Accepted**; added below.                                                                                                                                                                                      |

---

## Authentication

### User provisioning and account lifecycle

- **Decided:** no public self-registration. Users are created by a Director (`users:create`) and invited by email; the invitation link is a single-use, expiring token (Proposed: 72 h) that lets the user set a password.
- ✅ **First Director:** one-time CLI bootstrap (`pnpm --filter @autonova/api run bootstrap:director`) reading name/email/password from the environment (never CLI args); **refuses to run if any active Director exists**, serialised by a Postgres advisory lock so concurrent runs create exactly one (race test fails without the lock — mutation-checked); audited as `user.bootstrap_director`. No HTTP endpoint exists for it. _Forcing MFA enrolment at first login is part of the MFA flow, not yet built._ No default credentials, ever.
- Status machine: `INVITED → ACTIVE → DISABLED ⇄ ACTIVE` (DB CHECK ✅: ACTIVE requires a password). Users are never deleted. Reactivation is a Director action, audited, and requires a fresh password reset.
- **Last-administrator rule:** the API refuses to disable, de-role or MFA-reset the last active Director. If the last Director is locked out, recovery is the server-side CLI (audited as a system event), not an API backdoor.

### Password and credential policy

- ✅ **Decided:** argon2id (`@node-rs/argon2`). Parameters come from `ARGON2_*` configuration (default m=64 MiB, t=3, p=1 ≈ 200 ms on the dev machine) and are **benchmarked on the deployment host** with `pnpm --filter @autonova/api run bench:argon2` (target ≈ 250–500 ms); hashes carry their parameters, and `PasswordHasher.needsRehash` supports rehash-on-login (the login flow will call it).
- ✅ length 12–128, no composition rules, small deny-list, ≥5 distinct characters, not trimmed (`passwordSchema` in `@autonova/validation`). Passwords are never logged, returned or audited (the audit service refuses credential-looking keys).

### Access-token validation

- ✅ JWT, **15 min** (`ACCESS_TOKEN_TTL_SECONDS`, bounded 60–3600 s), HS256 with `JWT_ACCESS_SECRET` (≥32 chars; placeholder values refused in production). The verifier pins HS256 (rejects `alg:none` and HS512; tested). Claims are exactly: `sub` (user id), `sid` (session id), `iat`, `exp`. **No roles or permissions in the token**; a `jti` is added only if a concrete use appears.
- ✅ **On every protected request** the guard, in one query, loads: the user (must be `ACTIVE`), the session `sid` (must belong to `sub`, not revoked, not expired) and the user's **current** roles and permissions. A stale token can therefore never carry stale authority.
- ✅ **Decided:** no cache in Phase 1. The user base is small; one indexed query per request is cheaper than the risk and complexity of invalidation. **Maximum revocation delay = 0.** If measurement later justifies a cache, entries expire in ≤ 5 s and are explicitly evicted on disable, session revoke and role change.
- ✅ Expired token → 401 `TOKEN_EXPIRED`; anything else (missing, malformed, tampered, revoked/expired session, disabled user, subject mismatch) → one identical 401 `UNAUTHENTICATED`; the cause is logged at debug for operators only.
- ✅ Verified by tests that disable a user / revoke or expire a session / change roles while holding a still-valid JWT, and by mutation checks (removing each rule makes a test fail).

### Refresh-token rotation and reuse detection

✅ Implemented (migration `20261107132520_refresh_tokens`).

- Opaque 256-bit random value (`crypto.randomBytes(32)`, base64url); only its SHA-256 hex digest is stored (`refresh_tokens.token_hash`, UNIQUE, CHECK 64 hex chars). The raw value exists only in the HttpOnly cookie. It is never in a response body, a log, an audit row or a database row.
- **A session is its own token family.** Each rotation adds a row to `refresh_tokens` for the same `session_id`; revoking the session (`sessions.revoked_at`) therefore revokes every token it ever issued, and the refresh endpoint refuses a token whose session is not live. No separate `family_id`, `revoked_at` or `replaced_by_id` exists: they would duplicate state that `sessions` already holds. Fields: `id`, `session_id` (FK, RESTRICT), `token_hash`, `created_at`, `expires_at` (never later than the session's own expiry), `used_at` (set once, by the rotation that consumed the token).
- **Rotation is one atomic conditional update**, never read-then-write. Exact mechanism (PostgreSQL 16, default READ COMMITTED isolation, Prisma 7 with `@prisma/adapter-pg`): inside an interactive transaction, `UPDATE refresh_tokens SET used_at = $now WHERE token_hash = $hash AND used_at IS NULL AND expires_at > $now` (`updateMany`). Concurrent requests carrying the same token queue on the row lock; when the winner commits, each loser re-evaluates the `WHERE` clause against the committed row, matches nothing and gets `count = 0`. Only the request with `count = 1` goes on to insert the successor, in the same transaction. A partial unique index (`UNIQUE (session_id) WHERE used_at IS NULL`) is a second line of defence: the database refuses a second live token for a session even if the application were wrong. Proved by tests that fire 12 simultaneous refreshes at the real database and require exactly one 200.
- **Reuse of a token that already has `used_at`** ⇒ the session is revoked (`revoked_reason = refresh_reuse`), which kills the replacement token and the access token's session; audit `auth.refresh_reuse_detected` (SECURITY, written in the same transaction as the revocation); 401. The user must sign in again.
- **There is no grace period.** An earlier draft proposed a 10 s window returning `409 REFRESH_IN_PROGRESS` for concurrent legitimate refreshes. It was **not adopted**: any window lets a thief who replays within it succeed or at least learn that the token was live. Legitimate concurrency is instead prevented at the source: the web client serialises refreshes per tab (single flight) and across tabs (Web Locks API, below), so a well-behaved browser never presents a spent token. A request that loses a race anyway (for example a browser without Web Locks, two tabs) is indistinguishable from replay and ends the session; that is the deliberate, safe failure mode.
- **Lifetimes.** Access token 15 min (unchanged). Refresh token `REFRESH_TOKEN_TTL_SECONDS` (default 7 days), renewed on every use, so it is also the **idle timeout**; it is capped at the session's absolute expiry (`SESSION_ABSOLUTE_TTL_SECONDS`, default 30 days), which rotation never extends. This partly settles S6 (idle timeout) with Proposed values.
- Housekeeping: rotation deletes the session's tokens that are both used and expired. Used-but-unexpired tokens are kept so replay is still recognised. A cleanup job for expired sessions is still open.

### The `POST /auth/refresh` authentication boundary

`/auth/refresh` is `@Public()`: the global guard is bypassed because the caller has no (valid) access token. That does **not** make it unauthenticated; the route's whole authentication is performed by code that cannot be skipped:

1. `BrowserRequestGuard` (route guard, runs first): `Origin` must be in `CORS_ORIGINS` and the custom header `X-Autonova-CSRF: 1` must be present. Failure is `403 CSRF_REJECTED`, before any token is read, and the refresh cookie is deliberately **not** cleared (a forged request must not sign the user out or spend their token).
2. `RefreshSessionUseCase`: cookie present and well-formed; token hash found, unused and unexpired; session live and owned by the token's user; user `ACTIVE`; then rotate. All failures answer one `401 REFRESH_TOKEN_INVALID` and clear the cookie, so the response never says which check failed.
3. Nothing from the client is trusted except the opaque token: no user id, session id, role or permission is read from the request. Roles and the MFA state come from the database.

A test lists every public route (`auth.e2e-spec.ts`) so adding another `@Public()` fails the build until it is reviewed.

### Web: persistent login and protected first renders

✅ Implemented (Next.js 16.4.5, App Router, `src/app`). Verified against the installed Next.js docs: Server Components cannot set cookies; `cookies().set` works only in Server Functions and Route Handlers; `proxy.ts` (formerly middleware) can read and set cookies.

**What the browser does.** The access token lives only in memory (`SessionManager`); no token is ever written to localStorage, sessionStorage, IndexedDB or a script-readable cookie (a test asserts web storage stays empty). On load the app calls `POST /auth/refresh` with the HttpOnly cookie, stores the new access token in memory and loads `/auth/me`. Refresh is single-flight per tab and serialised across tabs with the Web Locks API (the cookie is shared by all tabs and rotates on each refresh, so two tabs refreshing at once would look like replay). Tokens are renewed on demand ~30 s before expiry or on `401 TOKEN_EXPIRED`; there is no background timer, so an idle tab does not keep a session alive. The refresh endpoint is called only by the `SessionManager`, never through the retrying wrapper, and a definitive rejection (`REFRESH_TOKEN_INVALID`) stops all further refreshes until the next sign-in. Failure handling: `TOKEN_EXPIRED` → renew and retry once (safe even for mutations, because the guard answers it before any handler runs); any other 401 → sign out, no refresh; `403 FORBIDDEN` / `403 MFA_REQUIRED` → shown as authorization errors, never a refresh, retry or sign-out; network/5xx while restoring → "could not check your session, try again", **not** signed out.

**Server-side rendering: what is and is not possible, and the decision.**

- The refresh cookie is host-only on the **API** origin with `Path=/api/v1/auth`. The Next.js server is a different origin and a different path, so the browser **never sends the cookie to it**. Server-rendered pages therefore have no credential, and an authenticated server-side fetch is impossible with the current boundary. The first server render of any protected page is, by construction, unauthenticated.
- **Decision (secure fallback, no second authentication mechanism):** protected pages are rendered by the server as a neutral shell ("Checking your session…") and nothing else. User data is fetched by the browser with the in-memory bearer token after the session is restored. The shell renders no children, no name, no navigation and no data until `status = authenticated` (a test renders it on the server and asserts none of that appears). Every page is also served with `Cache-Control: no-store`, so a shared cache can never keep one user's shell. Public pages (`/login`) stay static. Client-side checks only decide what to _show_; every byte of sensitive data is still protected by the API's per-request guard.
- This is an honest limitation, not server-side authentication: a protected page cannot be fully server-rendered with user data, and `proxy.ts` cannot redirect unauthenticated visitors before render (it cannot see the cookie either). The cost is a short "Checking your session…" state on each full page load.
- **Unresolved architectural decision (needs an owner):** true protected SSR requires moving the refresh cookie behind a backend-for-frontend, i.e. Route Handlers in the web app that proxy `/auth/*`, hold the HttpOnly cookie on the **web** origin (`Path=/`), refresh in a Route Handler or `proxy.ts` (the only places a rotated `Set-Cookie` can be written) and forward `Set-Cookie` correctly, with Server Components then calling the API using a short-lived token derived per request. That changes the cookie's domain and path, the CSRF design and the deployment topology, and doubles the refresh logic, so it was **not** done on assumption. Recommended trigger: when a page needs user-specific data on first paint (the dashboard), not before.

### Session revocation and invalidation

- A session = one login on one device. ✅ Users can list (`GET /auth/sessions`) and revoke (`DELETE /auth/sessions/{id}`) **their own** sessions; ownership is part of the `UPDATE ... WHERE user_id = $caller` so there is no check-then-act gap, and a foreign, unknown or already-ended id all answer the same `404 SESSION_NOT_FOUND`. ⏳ Directors revoking any user's sessions (`sessions:revoke`) is not built.
- Triggers that revoke **all** of a user's sessions in the same transaction as the change: disable, password change/reset, MFA reset, role change that removes a role (adding a role only needs the next request to pick it up, since roles are loaded live).
- ✅ Logout revokes the current session (and so all its refresh tokens), clears the cookie with the same attributes it was set with, and audits `auth.logout` in the same transaction. A second logout is a no-op (the access token is already dead: 401).
- ✅ Revoking the current session via `DELETE /auth/sessions/{id}` also clears the cookie; revoking another session never touches the caller's cookie or session.

### Director MFA

- **Decided (PRD §8.3): TOTP is mandatory for Directors, in Phase 1.** Voluntary for other roles.
- ✅ (gating) A Director's session is **restricted** until `sessions.mfa_verified_at` is set: only routes marked `@AllowRestrictedSession()` (`/auth/me`, `/auth/logout`, and later the MFA endpoints) are reachable; everything else is `403 MFA_REQUIRED` (tested). ⏳ The TOTP enrolment/verification endpoints that set `mfa_verified_at` are not built yet, so **a Director currently cannot use the system beyond viewing the profile page and signing out** — intended until step 6. **Enrolment is forced:** a Director without verified TOTP receives a session that can call only the enrolment endpoints. Enrolment completes only after the user submits a valid first code.
- **Login = password + TOTP.** The password step returns a short-lived (5 min) `mfa_pending` credential that is **not** an access token and works only on `/auth/mfa/verify`.
- TOTP secret encrypted at rest (AES-256-GCM, key `MFA_ENCRYPTION_KEY`, versioned for rotation); never returned after enrolment.
- **Replay protection:** store the last accepted time-step per user; a code at or before it is rejected. Window ±1 step. **Attempt limit:** 5 failures per 15 min per user → temporary lock, audited.
- **Recovery codes:** 10 single-use random codes shown once, stored hashed. Using one is audited and prompts re-enrolment.
- **Lost authenticator:** (1) a recovery code; else (2) another Director performs `users:reset_mfa` (reason required, cannot target self, audited, revokes sessions, forces re-enrolment); else (3) last-Director break-glass CLI with server access (audited).
- **No bypass:** the requirement is derived from the user's roles at request time and is **not configurable in the UI or by environment flag**. Assigning the Director role forces enrolment on the next request. Removing the role does not delete the enrolment. Password reset never skips MFA.

### Password recovery

- Request always returns 202 and reveals nothing about whether the email exists. Token: random, hashed at rest, single-use, **30 min**. Issuing a new token invalidates all earlier ones. Confirming atomically sets the password, consumes the token and revokes all sessions. Director resets still require TOTP at the next login.
- Email goes through a mail interface; until a provider is chosen (S3) a console adapter is used in development only.

### Rate limiting (`@nestjs/throttler`)

✅ Login is limited to 10/min per client IP (plus a 300/min global per-IP ceiling), answering `429 RATE_LIMITED` in the standard envelope (tested); `TRUST_PROXY_HOPS` controls how many proxy hops are trusted for the client IP (never `true`). ⏳ Per-email throttling (so a distributed attack on one account is limited) and the other endpoints below are not built. Limits (Proposed) on: login (per IP and per email), refresh, MFA verify, password-reset request/confirm, invitation accept, and (Phase 5) signing-OTP endpoints. ✅ Uniform error and equalised work (a throwaway hash is verified when the account is unknown/inactive); tested for identical responses across wrong password, unknown email, invited and disabled users. Timing equality is by construction, not asserted by a test. Behind a reverse proxy, trust-proxy must be configured so IP limits use the real client address.

---

## Authorization

### Role and permission model

- Roles and permissions are rows (tables exist ✅). Permission keys: `<resource>:<action>` (DB CHECK ✅). A user may hold several roles; effective permissions are the union.
- ✅ **Single source of truth:** `ROLE_PERMISSIONS` in `apps/api/src/modules/auth/domain/role-permissions.ts`; `pnpm db:seed` writes it and removes grants no longer listed. The guard reads the **database**, never that file. Currently 7 grants, all to Director (`users:list|read|create|update|assign_roles|disable`, `roles:list`). BD, Technical Lead and Finance hold none until their "Confirm" rows (S1) are approved.
- ✅ **Declared on every route:** `@RequirePermission(...)` (caller must hold ALL listed, no wildcards) or `@AnyAuthenticatedUser()` (`/auth/me`, logout). A private route declaring neither is refused with 403 and logged (fail closed; tested). Enforced inside the existing `AuthGuard`, so there is one guard and no ordering risk.
- ✅ A global guard **denies by default**; routes are private unless marked `@Public()`. A test enumerates every OpenAPI route and fails on any public route outside the allow-list (login, two health endpoints; mutation-checked).
- System roles cannot be deleted or re-keyed. Role/permission changes are audited and take effect on the next request (permissions are loaded live).

### Resource ownership policies

Permission checks answer "may this role do this kind of thing"; **policies** answer "may this caller do it to _this_ record". Policies live in the application/domain layer, not controllers. Lists filter in the SQL `WHERE` (never post-filter in memory, so pagination counts stay correct). A record the caller may not see returns **404**, not 403.

### Record visibility and reassignment (Proposed — pending S1)

| Scenario                               | Proposed policy                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| BD creates a lead                      | Becomes owner; can view/edit it                                                                                                |
| BD views/edits own lead                | Allowed                                                                                                                        |
| BD views/edits another BD's lead       | **Denied** unless explicitly shared (sharing mechanism deferred until requested)                                               |
| Lead reassigned                        | Access **follows the current owner**; previous owner loses edit **and** view access. Reassignment is audited                   |
| Historical activity after reassignment | Stays attached to the lead and visible to anyone authorised to view the lead. Ownership change never rewrites or hides history |
| Director                               | Views and edits all                                                                                                            |
| Technical Lead                         | **Open (S1)** — all leads, or only assigned/referred                                                                           |
| Finance                                | Denied lead access; sees client/ToR/invoice data needed for billing only                                                       |
| Shared companies/contacts              | **Open (S1)** — company ownership may differ from lead ownership                                                               |
| Signed ToRs                            | Director, Finance, Technical Lead (as needed) per PRD; **BD open (S1)**                                                        |

### Administrative overrides

- **Decided:** no wildcard (the earlier `*:override_*` is removed). Overrides are explicit permissions, each a controlled business action:

| Permission                             | Granted to (Proposed)                   | Condition                                  | Reason        | Audit event                |
| -------------------------------------- | --------------------------------------- | ------------------------------------------ | ------------- | -------------------------- |
| `qualification:override`               | Director                                | Result is non-passing                      | **Required**  | `qualification.overridden` |
| `discounts:approve`                    | Director                                | Discount above configured threshold        | Optional note | `discount.approved`        |
| `leads:reassign`                       | Director (BD for own leads is **Open**) | —                                          | Optional      | `lead.reassigned`          |
| `users:disable` / `users:assign_roles` | Director                                | Not yourself; not the last active Director | Optional      | `user.disabled` / …        |
| `users:reset_mfa`                      | Director                                | Not self; not bypassing enrolment          | **Required**  | `user.mfa_reset`           |
| `sessions:revoke`                      | Director                                | —                                          | Optional      | `session.revoked`          |

- ✅ Self-privilege rules for user administration: nobody may change their **own** roles or disable **themselves**; the last **active** Director can be neither demoted nor disabled (advisory-locked; concurrency tested).
- **No permission, including a Director's, can modify a signed ToR version.** Changes after signature are change requests / new versions (enforced by the domain **and** a database trigger, Phase 5).

### Permission matrix and stakeholder decisions

Derived from PRD §2.3. Cells marked **Confirm** are not seeded until approved. Phase 1 seeds only the permissions for rows marked "clear".

| Capability                                            | Director           | Business Dev         | Technical Lead                       | Finance      | State                                 |
| ----------------------------------------------------- | ------------------ | -------------------- | ------------------------------------ | ------------ | ------------------------------------- |
| Manage users/settings                                 | ✔                  | ✘                    | ✘                                    | ✘            | clear                                 |
| Manage product/price list                             | ✔                  | ✘                    | **Confirm**                          | ✘            | open                                  |
| View all revenue                                      | ✔                  | ✘                    | **Confirm**                          | needed views | open                                  |
| Create/edit/view leads & pipeline                     | ✔ all              | own                  | **Confirm**                          | ✘            | open (S1)                             |
| Log visits/calls                                      | ✔                  | own leads            | **Confirm**                          | ✘            | open                                  |
| Qualify leads                                         | ✔                  | ✔                    | **Confirm**                          | ✘            | open for TL                           |
| Override qualification                                | ✔ + reason         | ✘                    | ✘                                    | ✘            | clear                                 |
| Review/estimate scope                                 | ✔                  | draft                | ✔                                    | ✘            | clear                                 |
| Draft ToR/quote                                       | ✔                  | ✔                    | scope input; **confirm edit rights** | ✘            | open (S2)                             |
| Approve ToR technical review                          | ✔                  | ✘                    | **Confirm**                          | ✘            | open                                  |
| Approve discount above threshold                      | ✔                  | ✘                    | ✘                                    | ✘            | clear                                 |
| Sign/lock ToR                                         | Autonova-side      | client-side workflow | ✘                                    | ✘            | **who signs for Autonova: Open (S5)** |
| View signed ToRs                                      | ✔                  | **Confirm**          | as needed                            | ✔            | open for BD                           |
| Create/reconcile invoices, record payments            | ✔                  | ✘                    | ✘                                    | ✔            | clear                                 |
| Edit scope                                            | ✔ before signature | draft only           | scope review                         | ✘            | clear                                 |
| Manage support tickets                                | ✔                  | **Confirm**          | ✔                                    | ✘            | open for BD                           |
| Finance view of client/company details beyond billing | —                  | —                    | —                                    | **Confirm**  | open (S1)                             |
| Delete records                                        | ✔                  | ✘                    | ✘                                    | ✘            | mechanism: see Deletion below         |

### Deletion terminology (resolves PRD "Director can delete records")

- **Archive:** hides from ordinary views; fully restorable. **This is what the Director's "delete" does by default.**
- **Soft delete:** flagged deleted, data retained — not used unless a requirement appears (it adds a third state with no distinct business meaning).
- **Hard delete:** physical removal. **Not exposed as a normal action.** Only via a documented data-subject-request procedure (Kenya DPA), never for audit, financial or contractual rows. Open (S7).

---

## Document and file security

### File upload and download (built in Phase 3; **no upload endpoint ships without all of this**)

- Size limits and allow-listed types (Proposed starting values; PRD leaves them TBD — S8): images ≤ 10 MB (jpeg/png/webp/heic), voice notes ≤ 25 MB (m4a/mp3/ogg/webm), documents ≤ 20 MB (pdf/docx/xlsx/csv). **No SVG, HTML or executables.**
- **Validate content, not declared type:** sniff magic bytes server-side (e.g. `file-type`) and reject mismatches; ignore the browser's MIME type and the client file name for storage decisions.
- Stored under a **random server-generated key** (UUID), original name kept only as metadata and sanitised; path traversal is impossible because the name never reaches the filesystem.
- Storage behind a `FileStorage` interface (local volume in dev; object store in production, provider S9) and **never inside a web-served directory**; buckets/containers are private; no public URLs.
- Each file is tied to a parent record (activity → lead) and **inherits that record's access policy**. Download is an authenticated endpoint that runs the parent policy first (404 if not visible), streams the file with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. Being able to see a lead does not grant access to files elsewhere.
- Uploaded documents are untrusted: never rendered inline, never executed or parsed server-side beyond type sniffing.
- Malware scanning: ClamAV sidecar scanning before a file becomes downloadable — **Open (S8)**; until decided, files are served only as attachments to authorised users.
- Deleting a file is an archive of its metadata; the blob is purged by the retention procedure. Upload and download events are audited.

### External ToR signing (built in Phase 5; **no signing link ships without all of this**)

- **Separate trust boundary:** a client signing link is not an Autonova login. It authorises exactly one action (view + sign one ToR version) through dedicated routes (`/public/sign/*`) that cannot reach any other CRM data and issue no CRM session.
- Link token: ≥ 256-bit random, stored hashed, expiring (Proposed 7 days), revocable (e.g. when the ToR is withdrawn or superseded), single signing outcome.
- OTP (if the method is OTP, S4): 6 digits, hashed, 10 min validity, **5 attempts** then the link locks; resend is rate-limited; all attempts audited.
- **Signature records:** separate rows for Autonova and client (`UNIQUE(tor_version_id, party)`), each capturing: signer name and role/title, method, UTC timestamp, exact ToR version id, **SHA-256 of the exact PDF bytes shown to the signer**, IP address and user agent (retention per the privacy policy). Autonova-side signers must hold an explicit permission (S5).
- **Integrity:** the PDF is generated once when the ToR is sent and stored; the hash covers those stored bytes (not a mutable DB object). Signing applies to that artifact; if content changes, a new version and new PDF are required. Signed versions, their scope items, milestones and signature rows are immutable via a database trigger. The signed PDF stored is the artifact whose hash was recorded.
- Both signatures + conversion eligibility are verified **inside one transaction**; conversion is idempotent (`UNIQUE(signed_tor_version_id)`).
- Every send, view, OTP attempt, signature and lock is audited.

---

## Audit logging

### Business audit events (coverage is mandatory per module)

**Rule: no business module ships a critical mutation without its audit event.** Audit write and business change are in the **same transaction** (both succeed or both fail) — ✅ `AuditService.record(tx, …)` takes the transaction client; tested that the audit row rolls back with a failed change and the change rolls back with a failed audit write.

| Event                                                                                      | Ships with                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| User create/disable/enable, role & permission changes, session revocation, MFA enrol/reset | Phase 1 (✅ so far: `user.bootstrap_director`) |
| Product catalogue and price changes                                                        | Scope catalogue (5)                            |
| Lead creation, reassignment, stage changes                                                 | Leads (3)                                      |
| Qualification result and override (+reason)                                                | Qualification (4)                              |
| ToR creation, version changes, change requests                                             | ToR (5)                                        |
| Discount request/approval                                                                  | ToR (5)                                        |
| ToR send, signature, lock                                                                  | ToR (5)                                        |
| Quotation status changes                                                                   | Quotations (6)                                 |
| Conversion to client                                                                       | Conversion (6)                                 |
| Invoice and payment changes, reconciliation                                                | Billing (7)                                    |
| File upload/download                                                                       | Phase 3                                        |

### Security events

✅ (`AuditService.recordSecurity`, `audit_logs.category`) Failed logins, MFA failures/lockouts, refresh reuse, password reset, token and signing-link failures have no business transaction, so they are written **in their own transaction**, best-effort-but-awaited (a failure to audit a security event is itself logged at error level and never blocks a legitimate request). **Proposed:** same `audit_logs` table with a `category` column (`BUSINESS`|`SECURITY`) so one tamper-protected mechanism exists and retention can differ per category (S7). Volume control: throttled requests are counted, not logged individually.

### Database enforcement

- ✅ `audit_logs` is append-only: a row trigger rejects UPDATE/DELETE and a **separate statement trigger rejects TRUNCATE** (tested).
- **Triggers do not stop the table owner or a superuser** (they can `DISABLE TRIGGER`). ✅ Therefore two database roles: the **owner** (the `POSTGRES_USER` role — owns objects, used only by migrations via `MIGRATION_DATABASE_URL`) and `autonova_app` (created by migration `20261107025746_audit_category_and_app_role`; runtime via `DATABASE_URL`; DML on business tables; **only INSERT and SELECT on `audit_logs`**; no DDL, cannot read `_prisma_migrations`, not a superuser). `pnpm db:provision-app-role` sets its password. Tested at both layers: the app role gets `permission denied` for UPDATE/DELETE/TRUNCATE/DDL/`DISABLE TRIGGER`, and the owner is still stopped by the triggers. _Note:_ in the dev Docker image the owner is also the bootstrap **superuser**; production should use a non-superuser owner (deployment task, Phase 10). Superuser access is restricted and, in production, `pgaudit`-style statement logging is enabled. Hash-chaining the log is **not** adopted now (complexity without a stated requirement); revisit if tamper-evidence beyond privileges is required.

### Audit data minimisation

✅ (`snapshot()` helper + credential-key guard) Snapshots are built from **explicit per-entity field allow-lists** (never `JSON.stringify(entity)`). Never stored: passwords, hashes, tokens, OTPs, MFA secrets, recovery codes. Personal data in snapshots is limited to what is needed to explain the change (prefer ids and changed fields over full copies).

---

## Infrastructure security

### Secrets management

Env vars only, validated at startup (process refuses to start if missing or weak: signing/encryption keys ≥ 32 bytes of entropy). Separate values per environment; never committed (`.env` ignored ✅); production values come from the host's secret store. Required (added in Phase 1): `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY`, DB URLs for both roles, argon2 parameters. Rotation procedure documented with the first deployment.

### Database privileges

✅ As in [Database enforcement](#database-enforcement): the API runs as `autonova_app`, never as the owner or a superuser. Each future migration that adds an immutable table must `REVOKE` UPDATE/DELETE/TRUNCATE from `autonova_app` explicitly (default privileges grant full DML to new tables).

### HTTPS, CORS and cookies

TLS terminates at the reverse proxy (production); HSTS via `helmet` ✅. CORS uses an explicit origin list ✅ (`CORS_ORIGINS`, `*` rejected in production, `credentials: true`, allowed headers limited to `authorization`, `content-type`, `x-request-id`, `x-autonova-csrf`).

✅ **Refresh cookie** `autonova_refresh`: `HttpOnly; SameSite=Strict; Path=/api/v1/auth` (covers refresh, logout and session revocation, nothing else), no `Domain` (host-only), `Expires` = token expiry, and **`Secure` whenever `NODE_ENV=production`**. One class (`RefreshCookie`) sets and clears it, so the attributes always match (a cookie is only cleared if name, path and domain match). **Development-only difference:** with `NODE_ENV=development|test` `Secure` is omitted so the cookie works over plain `http://localhost`; browsers treat `localhost` as a secure context, so a production-mode build on `localhost` (docker compose) still works with `Secure` set. Nothing else is relaxed for development.

✅ **CSRF** for cookie-authenticated requests (`refresh`; logout and session revocation are also bearer-authenticated, so the cookie alone cannot trigger them): required `Origin` in the allow-list **and** the custom header `X-Autonova-CSRF: 1`. A cross-site form or `<img>` cannot add a custom header, and a cross-site `fetch` that does must pass a CORS preflight that only allowed origins pass. `SameSite=Strict` is a third, independent layer. Requires the web app and API to be **same-site** (same registrable domain; different ports on `localhost` count as same-site). If they are ever deployed on different registrable domains, `Strict` cookies would not be sent and this design must be revisited.

### Backups and recovery (PRD §8.4)

Daily automated `pg_dump`/base backup, **encrypted** (key held separately from the backup store), retained ≥ 30 days, stored off the database host, access restricted and logged. A written restore runbook and a **restore test at least quarterly** (a backup never restored is unverified). RPO ≤ 24 h follows from daily backups; **RTO is Open (S10)**. Required before real client data is entered.

### Dependency security

Lockfile pinned; `pnpm audit` and an update review at each phase close; install scripts deny-by-default ✅ (`allowBuilds`).

---

## Privacy and data governance (Kenya Data Protection Act 2019)

Technical controls do not establish compliance; the business needs a privacy/compliance review. This section is the engineering input to it.

| Topic                              | Current position                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data collected (from PRD) | Contact names, titles, phone, email, WhatsApp; lead/contact notes; visit GPS check-ins; voice notes and photos; user accounts; signer name/IP/user-agent on ToR signatures; payment references |
| Purpose                            | Sales, contracting, billing and support for Autonova's clients and prospects                                                                                                                   |
| Access                             | Role/ownership policies above; Finance least-privilege (S1)                                                                                                                                    |
| Retention                          | **Open (S7).** Constraint: audit rows are append-only, so retention must be an explicit documented DBA procedure                                                                               |
| Correction / export                | Correction via normal edit (audited). Export per data subject: procedure to be defined (S7)                                                                                                    |
| Deletion requests                  | Hard-delete procedure as above; excluded for financial/contractual/audit records (statutory retention to be confirmed with advisers)                                                           |
| Breach handling                    | Incident procedure incl. notification obligations to be written with compliance advice (S7)                                                                                                    |
| Third-party processors             | Email, WhatsApp/SMS, M-Pesa, eTIMS, storage, backups — each reviewed before integration (Phase 10; storage in Phase 3)                                                                         |
| Registration / obligations         | Whether Autonova must register with the Office of the Data Protection Commissioner and other duties: confirm with a compliance adviser                                                         |

---

## Security testing

Each category is a required scenario list; tests are written with the feature (see [07](07-testing-strategy.md)).

- **Authentication:** login success/failure parity (message and timing class); disabled/invited users rejected; throttling.
- **Access-token / session:** disabled user's still-valid JWT rejected on the next request; revoked session rejected; stale-role token gets the **new** role's authority; expired token → 401.
- **Token replay:** reuse of a rotated refresh token revokes the family; **concurrent refresh with the same token yields exactly one successor** (race test against the real DB); the 10 s grace path does not revoke.
- **CSRF:** refresh/logout without the custom header or with a foreign Origin are rejected; cookie flags/path asserted.
- **MFA:** enrolment forced; wrong/replayed/old-window code rejected; lockout after 5 failures; recovery code single-use; role change cannot bypass; reset rules (not self, not last Director).
- **Authorization / IDOR:** per role × sensitive action matrix; another user's `/:id` returns 404; list endpoints never leak other owners' rows; public-route allow-list test; privilege escalation attempts (assigning self a role); override requires reason.
- **File access (Phase 3):** magic-byte mismatch rejected; oversize rejected; no access to a file whose parent record is invisible; download headers; path traversal names.
- **Signing (Phase 5):** expired/used/revoked link; OTP attempt limit; link cannot reach CRM routes; hash matches stored PDF; signed version immutable via API **and** direct SQL.
- **Audit integrity:** UPDATE/DELETE/TRUNCATE rejected ✅ (tested); app role lacks the privileges; audit row present in the same transaction as each audited mutation and absent on rollback; no secret in any snapshot.

---

## Open security decisions

| #   | Decision                                                                                                                                                                                                                                 | Needed from                  | Blocks                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| S1  | Record-visibility answers: Technical Lead lead access; BD view of shared companies/contacts, signed ToRs and tickets; previous-owner access after reassignment (Proposed above); Finance client-detail scope; all matrix "Confirm" cells | Sam / Augustine              | Permission seeding for those rows (Phase 1 proceeds with "clear" rows) |
| S2  | Technical Lead edit rights over ToR scope vs estimates only                                                                                                                                                                              | Augustine                    | Phase 5                                                                |
| S3  | Email provider (invites, resets, ToR delivery)                                                                                                                                                                                           | Product                      | Phase 1 go-live                                                        |
| S4  | Signature method(s) and OTP delivery (typed+OTP / drawn / scan) — PRD Q12–13                                                                                                                                                             | Product                      | Phase 5                                                                |
| S5  | Who may sign on behalf of Autonova                                                                                                                                                                                                       | Directors                    | Phase 5                                                                |
| S6  | Session idle timeout and absolute lifetime                                                                                                                                                                                               | Product                      | Phase 1 (default Proposed: 12 h idle-bound refresh, 30 d absolute)     |
| S7  | Retention, export, deletion, breach procedure; audit retention vs DPA                                                                                                                                                                    | Product + compliance adviser | Before Phase 3 stores personal data at scale                           |
| S8  | Upload limits/types and malware scanning                                                                                                                                                                                                 | Product                      | Phase 3                                                                |
| S9  | File storage provider                                                                                                                                                                                                                    | Eng/Product                  | Phase 3                                                                |
| S10 | RTO and backup storage location                                                                                                                                                                                                          | Product                      | End of Phase 1                                                         |
