# Implementation progress

_Last updated: 2026-11-07 · Current phase: **Phase 1 in progress** — login, permission model and the first user-administration slice are done; next: refresh tokens (step 5 of the original plan), then TOTP MFA_

## Phase 1 — Authentication and access control 🟡

| Step                                                                                                        | State   | Evidence                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| 0. DB role split + `audit_logs.category` (migration `20261107025746_audit_category_and_app_role`)           | ✅      | e2e: app role denied UPDATE/DELETE/TRUNCATE/DDL/DISABLE TRIGGER/`_prisma_migrations`; owner still stopped by triggers |
| 1. Audit service (business in-transaction, security standalone, allow-list snapshots, credential-key guard) | ✅      | 11 unit + 4 e2e (rollback in both directions)                                                                         |
| 2. Password hasher (argon2id, configurable, rehash detection) + password policy + benchmark script          | ✅      | 5 + 6 unit tests; bench: 199 ms at the default cost on the dev machine                                                |
| 3. First-Director bootstrap (CLI only)                                                                      | ✅      | 5 e2e incl. race test (mutation-checked) + manual CLI run (invalid input → exit 2, success, repeat refused)           |
| 4. Login + `/auth/me` + deny-by-default guard + per-request user/session checks                             | ⏳ next | needs `sessions`, `refresh_tokens` migration                                                                          |
| 5. Refresh rotation + logout/revocation                                                                     | ⏳      |                                                                                                                       |
| 6. Director TOTP MFA                                                                                        | ⏳      |                                                                                                                       |
| 7. Permission guard, role/permission admin, permission seeding ("clear" rows)                               | ⏳      | S1 for the rest                                                                                                       |
| 8. Invitations / password reset / user admin API                                                            | ⏳      | S3 email provider                                                                                                     |
| 9. Backups + restore test                                                                                   | ⏳      | S10                                                                                                                   |

**Final gate (after user administration):** format ✔ · lint ✔ · typecheck ✔ · unit 148 (packages 23, api 70, web 55) ✔ · api e2e 102 ✔ (incl. the 52 Step 4 security regression tests, re-run separately) ✔ · `pnpm build` ✔ · `migrate status` up to date, drift exit 0 ✔. API docker image not rebuilt.

**Previous gate (after step 4):** format ✔ · lint ✔ · typecheck ✔ · unit 82 (3+2+13 packages, 53 api, 11 web) ✔ · api e2e 58 ✔ · `pnpm build` ✔ · migrate status up to date, no drift ✔. (API docker image last built after step 3; not rebuilt after step 4.)

**Things to know (step 4)**

- **Directors are intentionally locked out of everything but `/auth/me` and logout** until the TOTP flow (step 6) exists. The dev Director (`sam@autonova.test`) therefore sees a "Two-factor verification required" notice after login. This is the designed behaviour, not a bug. To exercise a non-Director session before user admin exists, create a user in the test helpers or directly in the DB.
- **There is no refresh token yet, so a page reload signs the user out** (the access token lives only in memory — never localStorage — by design). Step 5 fixes this with the HttpOnly refresh cookie.
- **New required env vars:** `JWT_ACCESS_SECRET` (≥32 chars; `.env` got a generated one; production refuses placeholder values), optional `ACCESS_TOKEN_TTL_SECONDS`, `SESSION_ABSOLUTE_TTL_SECONDS`, `TRUST_PROXY_HOPS`, `SWAGGER_ENABLED`. **Swagger is now off in production by default.**
- **No permissions are seeded**, so `/auth/me` returns `permissions: []` for everyone. The permission guard and "clear"-row seeding are step 7.
- **Unknown paths still return 404 unauthenticated** (Nest resolves routing before guards). Every route that exists is private unless `@Public()`; a test enumerates this.
- **Not done in step 4:** per-email login throttling; session idle timeout (S6); a `sessions` cleanup job for expired rows.
- **Next generates `apps/web/AGENTS.md`** on `dev` start (a generic notice to read `node_modules/next/dist/docs`). I left it untracked; decide whether to commit or ignore it.
- The `autonova-api-1` container is still the pre-role-split image (see above) and was not rebuilt.

**Things to know (earlier steps)**

- `.env` gained `APP_DB_PASSWORD`, `DATABASE_URL` (now `autonova_app`) and `MIGRATION_DATABASE_URL` (owner); `.env.example` is updated. The dev database already has the migration applied, `autonova_app` provisioned and **one dev Director** (`sam@autonova.test`, dev-only password — dev data only, not a credential to reuse).
- The still-running `autonova-api-1` container predates the role split and uses the old owner URL; it cannot be recreated from this environment (Docker "permission denied", see Phase 0 caveat). A normal `docker compose --profile app up --build` picks up the new config.
- Dev Docker Postgres: the owner is the bootstrap superuser. Production must use a non-superuser owner.
- `needsRehash` exists but nothing calls it yet (login flow).
- The bootstrap does not itself force MFA enrolment; the login flow will derive that from the Director role.

## Phase 0 — Foundation ✅

| Deliverable                                                                                                                  | State | Evidence                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| Repository state established                                                                                                 | ✅    | Started with only `docs/prd.md`; a `create-turbo` starter appeared mid-task and was removed with user approval (git history kept) |
| pnpm monorepo (`apps/*`, `packages/*`, catalog)                                                                              | ✅    | `pnpm install` clean                                                                                                              |
| Shared packages: config, enums, contracts, validation                                                                        | ✅    | build + 12 unit tests                                                                                                             |
| Docker Compose + PostgreSQL 16                                                                                               | ✅    | healthy container, host port 5433                                                                                                 |
| NestJS 12 API: config validation, pino logging, request-id, error envelope, zod validation pipe, helmet/CORS, Prisma service | ✅    | 11 unit + 14 e2e tests                                                                                                            |
| Health endpoints (liveness + DB readiness)                                                                                   | ✅    | 200 with DB up; **503 with Terminus body verified against an unreachable DB**; liveness stays 200                                 |
| Swagger/OpenAPI                                                                                                              | ✅    | `/api/docs`, `/api/docs-json` (e2e)                                                                                               |
| Prisma 7 + initial migration                                                                                                 | ✅    | `20261107022331_init_identity_access_audit`; `migrate status` up to date; `migrate diff --exit-code` = no drift                   |
| Seed                                                                                                                         | ✅    | 4 system roles, idempotent (run twice)                                                                                            |
| Next.js 16 + Tailwind 4 web app                                                                                              | ✅    | status page shows live DB state; "Unreachable" state verified; viewed in browser                                                  |
| Dockerfiles for api and web                                                                                                  | ✅    | both images built; both containers started and served correctly (see caveat below)                                                |
| Documentation set (01–08, flows, ADR-001..004)                                                                               | ✅    | this folder                                                                                                                       |

### Quality gates actually run (final)

`format:check` ✔ · `lint` (oxlint type-aware) ✔ · `typecheck` (all workspaces) ✔ · unit: enums 3, contracts 2, validation 7, api 12 = **24 pass** · api e2e: **14 pass** (fresh DB, all migrations from zero) · `pnpm build` ✔ · migration drift: none.

### Database (see [04](../04-database-design.md))

Tables: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs`. Hand-written constraints: lower-case email, key formats, ACTIVE ⇒ password, **audit log append-only trigger** (UPDATE/DELETE/TRUNCATE rejected; tested). All FKs `RESTRICT`.

### API endpoints (see [05](../05-api-conventions.md))

`GET /api/v1/health/live`, `GET /api/v1/health`. Nothing else exists; no endpoint requires auth yet.

### Known limitations

- No authentication, authorization, users API, or audit service yet (tables exist; no code writes to them).
- Permissions and role grants are **not seeded** (permission matrix still has "Confirm" cells).
- No CI pipeline; no Playwright (added with the first real UI flow).
- `apps/worker` not created (no jobs yet — [ADR-001](../decisions/ADR-001-modular-monolith.md)).
- Web app has no logo asset yet (PRD §8.7 requires Autonova logo in app and PDFs) and no auth shell.
- **Environment caveat:** while testing the containerised stack, the `autonova-web-1` container could not be stopped/removed by Docker ("permission denied", AppArmor/host restriction). It, `autonova-api-1` and `autonova-postgres-1` are still running. Local cleanup: `docker compose --profile app down` may need elevated rights or a Docker restart.
- A failed first `docker compose --profile app up` (host port 3000 was in use by a local server I started) left the web container without a published port; I verified it via its container IP instead of `localhost:3000`. Compose behaves normally on a clean start.
- Prisma 7 is pinned at 7.10.1 (8.0 is RC). Zod 4, TypeScript 6, Next 16, NestJS 12 are current as of today.

### Decisions made during Phase 0 (and why)

- **Node 20 runtime floor** is `>=20.19` (Prisma/Terminus requirement); Docker images use Node 22.
- Host PostgreSQL port **5433**, bound to 127.0.0.1 (5432 is commonly taken; not exposed on the LAN).
- Docker `app` profile so everyday development runs apps on the host with hot reload.
- **oxlint** (what NestJS 12's scaffold ships) with type-aware rules instead of ESLint; `no-explicit-any`, no non-null assertions and floating promises are errors.
- `packages/*` compile to `dist` (consumed via `exports`), so `pnpm build:packages` runs before typecheck/test at the root.
- Audit immutability and ToR-signed immutability are database-level, not just app-level.
- No Turborepo: four small packages don't justify another tool yet; pnpm `--filter` is enough.
- E2E suite uses a throwaway `autonova_test` database it recreates each run.

## Open decisions

Mapped to the phase they block; none blocks starting Phase 1 except the first.

| #   | Decision needed                                                                                                                                             | Owner              | Blocks                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- |
| D1  | S1 in [06](../06-security-and-access-control.md#open-security-decisions): permission-matrix "Confirm" cells, record visibility, reassignment, Finance scope | Sam/Augustine      | **Phase 1 permission seeding** for those rows ("clear" rows proceed) |
| D3  | Email provider for invitations/reset (S3; console adapter meanwhile)                                                                                        | Product            | Phase 1 go-live only                                                 |
| D4  | Session idle/absolute lifetime (S6; defaults proposed) and RTO/backup location (S10)                                                                        | Product            | End of Phase 1                                                       |
| D5  | Stage/outcome model; backward moves; lead without company; warn vs block duplicates (Q1–Q4)                                                                 | Product            | Phases 2–3                                                           |
| D6  | Offline drafts: Phase 1 vs 3 (Q35)                                                                                                                          | Product            | Phase 3                                                              |
| D7  | File storage provider and limits                                                                                                                            | Eng/Product        | Phase 3                                                              |
| D8  | BANT weights, scale, pass mark (Q6–8)                                                                                                                       | Product            | Phase 4                                                              |
| D9  | ToR template/clauses, signature method and evidence, change-request boundary, VAT rounding, discount threshold (Q11–17)                                     | Product/Legal      | Phase 5                                                              |
| D10 | Quote numbering/validity/immutability (Q18–20)                                                                                                              | Product            | Phase 6                                                              |
| D11 | Multiple client accounts per company (Q21)                                                                                                                  | Product            | Phase 6                                                              |
| D12 | Invoice numbering, allocation, credit notes, overdue/suspension (Q22–27)                                                                                    | Finance            | Phase 7                                                              |
| D13 | Data retention/deletion vs append-only audit (Kenya DPA 2019); RPO/RTO                                                                                      | Product/Compliance | Phase 10 (design note needed before Phase 3 stores personal data)    |

## Handover for the next task

**Phase:** 1 — Authentication and access control (steps 0–3 done, see above). **Security design:** [06](../06-security-and-access-control.md) v0.2 (revised 2026-11-07 after an external review; Director MFA mandatory, per-request user/session validation, roles removed from the JWT, no wildcard overrides). **First flow:** first-Director bootstrap, then login + current user.

**Why this first:** everything else needs an authenticated actor; login + `/me` is the smallest slice that exercises UI → API → guard → use case → Prisma → DB end to end, and the Prisma tables already exist. Remaining order: (3b) user creation use case, (5) refresh rotation (atomic) + session list/revoke, (6) Director TOTP enrolment/verify/recovery, (7) permission guard and role/permission admin, (8) password reset/invitation, (9) backups + restore test.

**Relevant files:** `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `app.setup.ts`, `src/common/*`, `packages/validation`, `packages/enums`, docs 05/06 and `flows/authentication.md`.

**New work will need:** migration for `sessions`, `refresh_tokens`, `one_time_tokens`, `user_mfa`, `mfa_recovery_codes`, `audit_logs.category` and the `autonova_migrator`/`autonova_app` DB role split; `argon2`, `@nestjs/jwt`, `@nestjs/throttler`, `cookie-parser`, a TOTP library dependencies; env vars `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY`, argon2 parameters, token TTLs, cookie settings; Playwright for the login journey; the first permission keys ("clear" rows only until D1); an encrypted-backup + restore runbook before real data.

**Acceptance criteria:** see [flows/authentication.md](../flows/authentication.md) and [authorization.md](../flows/authorization.md).

## Notes for the next task

- `docs/webdesign.md` (frontend design guidelines) was added to the repo by the user during Phase 0. It was **not** reviewed or applied: the Phase 0 web app is a minimal status page using only the navy/cyan brand tokens. Read it before building the first real UI (Phase 1 login) and reconcile it with [08](../08-development-conventions.md) (its header names the path `docs/design/webapp.md`).

## Security review v0.1 → v0.2 (2026-11-07)

An external review of doc 06 was incorporated; the item-by-item disposition is in [06](../06-security-and-access-control.md#review-disposition-v01--v02). One point was declined in part: file-upload security was built into the design now but its **build phase stays roadmap Phase 3** (first upload endpoint), because the review read the PRD's "Phase 1" as roadmap Phase 1; likewise ToR signing security is built in roadmap Phase 5. Both carry a hard gate: no such endpoint ships without its controls. No code changed in this revision.

## User administration slice — notes (2026-11-07)

**Decisions made (also in `docs/flows/user-management.md`):** users are created `INVITED` only, the caller can neither choose status nor set a password; nobody may change their own roles or disable themselves; last-_active_-Director protection under an advisory lock shared with bootstrap; `INVITED → DISABLED` allowed, re-enable not built; removing a role revokes sessions, adding one does not; only `fullName` is editable via `PATCH`; no-op changes write no audit row.

**Known limitations**

- **Nobody invited can sign in yet.** There is no email provider (S3), no invitation acceptance and no password reset, so `INVITED` users stay invited. This is the main functional gap of the slice; the UI says so.
- **A Director cannot use any of this in the real app yet:** their session stays restricted until the TOTP flow (step 6) exists. The tests mark sessions MFA-verified in the database; my browser check used a temporary database trigger for the same purpose, which I **removed** afterwards (verified: no trigger or function left; the test Director account is disabled).
- A page reload still signs the user out (no refresh token yet).
- Non-Directors cannot edit even their own name; there is no self-service profile.
- No re-enable; no MFA reset; no "re-issue invitation".
- Web: the shell is a minimal header, not the full sidebar of `docs/webdesign.md` §4; no column sorting or visibility on the user table (search, status and role filters and server-side paging exist).
- The dev database now contains test users (`sam@…` bootstrap Director, `uidir@…` disabled UI-test Director, `wanjiru.kamau@…` disabled) — dev data only.
- Browser-tool quirks again: clicks were issued through the page; the `Escape`-to-close behaviour of the confirmation dialog could not be confirmed with synthetic key events (the dialog is a native modal `<dialog>`: focus trap, inert background and Cancel-first focus were confirmed; Escape is handled in code by the `cancel` event and is not covered by an automated test).
- Two ambiguities worth a human look: (1) Directors may hold several roles at once (allowed today); (2) the `disable` reason is optional.

**Why the web tests use jsdom 29:** jsdom 31 needs Node ≥ 20.22/22.22 and fails to start on this machine's Node 20.20 (the project floor is 20.19).
