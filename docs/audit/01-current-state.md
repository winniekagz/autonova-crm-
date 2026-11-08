# Autonova CRM — Current State Audit

_Initial audit: 7 November 2026, before the follow-on MFA/Leads sprint. Repository baseline then was `main`, HEAD `601e5cd`, with substantial uncommitted refresh/session work. Follow-on changes are summarized at the end._

## Scope and evidence

The available business baseline is [`docs/prd.md`](../prd.md), alongside architecture, security, database, API, design, and implementation documentation. The PRD refers to a Scope of Work prepared 6 November 2026, but the source SOW was not present in the repository. This audit therefore traces against the PRD and records that limitation rather than claiming SOW verification. Source file references below are repository paths; runtime evidence is from the local development environment only.

Inspected the application, schema, migrations, controllers, guards, use cases, UI routes, tests, Compose setup, and docs. Read-only checks run: `pnpm lint`, `pnpm typecheck`, `pnpm test` (passed); `pnpm format:check` (fails only on vendored `.agents/` Markdown); API migration status (five migrations, up to date); local Compose inspection and HTTP checks (API health/readiness and OpenAPI, web root returned 200). `pnpm build` built the API but the Next build failed at a Turbopack/PostCSS child-process operation with `Operation not permitted`, including on retry. This looks environment-related but is unresolved. E2E was not rerun: its global setup drops and recreates `autonova_test`, which this audit was expressly not authorized to do. Existing test counts cited from progress documentation are not a fresh run.

## Product and architecture

Autonova is intended to manage the sales and client lifecycle: lead capture, qualification, visits, scope/ToR and quotes, both-party ToR signature, client conversion, billing, and support. The PRD's key invariant is that quote acceptance or a stage change alone does not convert a lead; both parties must sign the ToR.

The repository is a pnpm monorepo with a Next.js 16 web app, NestJS 12 modular-monolith API, PostgreSQL 16/Prisma 7, and shared config/enums/contracts/validation packages. The API is REST under `/api/v1`; local Swagger is enabled at `/api/docs`, with OpenAPI JSON at `/api/docs-json`. `docker-compose.yml` supplies local PostgreSQL, API, and web services. No production deployment manifest, CI workflow, worker, or hosted environment evidence was found. Local container health does not establish staging/production availability.

## Implemented surface

### API and identity

Current controllers expose:

| Area | Routes |
| --- | --- |
| Health | `GET /api/v1/health/live`, `GET /api/v1/health` |
| Authentication | `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`; MFA status/enrollment/confirmation/verification/recovery under `/api/v1/auth/mfa/*`; `/api/v1/auth/me`; logout and own-session list/revoke |
| Users and roles | `GET/POST /api/v1/users`, `GET/PATCH /api/v1/users/:id`, `PUT /api/v1/users/:id/roles`, `POST /api/v1/users/:id/disable`, `GET /api/v1/roles` |
| Leads | `GET/POST /api/v1/leads`, `GET/PATCH /api/v1/leads/:id` |

Authentication uses Argon2id password hashing, short-lived HS256 access JWTs, database-backed session validation, fail-closed route protection, login throttling, and audit events. Refresh tokens are random opaque values stored as hashes, rotated atomically, and delivered in an HttpOnly cookie. Refresh applies Origin and CSRF-header checks; token reuse revokes its session. Director MFA now uses encrypted TOTP credentials, replay-step tracking, one-time recovery codes, and the restricted-session guard. Refresh never verifies MFA. MFA reset-by-another-Director and key rotation procedures remain absent.

User administration supports list/filter/pagination, invite-only creation, detail/name update, role assignment, and disable with session revocation and last-active-Director protection. New users remain `INVITED`; invitation acceptance, email delivery, password reset, and re-enable are absent. Leads support create/list/search/detail/update. BD access is limited to owned records; Director access spans all leads. New leads belong to their creator and start at `NEW_LEAD`; reassignment and stage transitions remain disabled.

### Data and web app

The database contains identity/access, sessions/refresh tokens, MFA/recovery state, audit entities, and a first leads table. Migrations include append-only audit protections and least-privilege runtime DB role setup. Companies, contacts, activities, qualification, ToR, quotes, client accounts, billing, tickets, tasks, notifications, and attachments remain absent.

The web routes cover login, Director MFA setup/verification/recovery, users, sessions, a placeholder home, and lead listing/create/detail/update. There is no dashboard or downstream CRM workflow. Shared UI primitives and brand tokens exist, with responsive utility styling. The full application shell in `docs/webdesign.md` remains mostly design guidance.

### Integrations and operations

No working email, TOTP, PDF generation, e-signature, file/object storage, M-Pesa, WhatsApp/SMS, eTIMS, accounting, or reporting adapter was found. No backup automation or restore evidence was found. Local `.env.example` is a development template; no hosted secrets/configuration or TLS/proxy setup was verified. Production security, privacy, retention, availability, RPO/RTO, and Kenya DPA obligations require product/operations decisions and validation; this audit is not a compliance determination.

## Documentation condition

Several docs described older snapshots. The follow-on sprint updated README, API reference, auth flow, security and progress docs; older progress checkpoints are historical notes. This initial audit does not establish production hosting or operations.

The product phase labels also need reconciliation: PRD §4 labels several sales capabilities P1 and conversion P2, while PRD §10 Phase 1 exit includes Won/Lost and signed ToR but does not clearly include account creation. Engineering roadmap phases split these capabilities differently. This affects scope and estimates.

## Git and audit boundary

The workspace already contained uncommitted refresh/session implementation and other generated or local files before this audit. No such files were staged, altered, cleaned, or committed. This audit adds only the three reports in `docs/audit/`; no application implementation or database/data operation was performed. See [`02-requirements-traceability.md`](02-requirements-traceability.md) and [`03-gap-analysis-and-roadmap.md`](03-gap-analysis-and-roadmap.md) for requirement status and sequencing.

## Follow-on sprint update

The sprint added two additive migrations and the Director MFA and leads workflows described above. They were applied only to the local `autonova` database; E2E setup targets a separate `autonova_test` database. Director and BD lead permissions were seeded locally from explicit PRD scope. See [`../implementation/progress.md`](../implementation/progress.md) for the verification results and remaining work.
