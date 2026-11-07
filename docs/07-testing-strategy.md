# 07 — Testing strategy

Runner: **Vitest** everywhere (NestJS 12 is ESM-only; Jest is not used).

| Layer            | Scope                                                                              | Where                                                              | DB? | Run                                        |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --- | ------------------------------------------ |
| Unit             | Pure logic: domain rules, schemas, filters, pipes                                  | `src/**/*.spec.ts`, `packages/*/src/*.spec.ts`                     | no  | `pnpm test`                                |
| Integration      | Real PostgreSQL: migrations, constraints, triggers, repositories                   | `apps/api/test/*.e2e-spec.ts`                                      | yes | `pnpm --filter @autonova/api run test:e2e` |
| E2E (API)        | Full Nest app over HTTP with supertest, through the real pipeline (`configureApp`) | `apps/api/test/*.e2e-spec.ts`                                      | yes | same                                       |
| UI / browser E2E | Critical user journeys                                                             | Playwright — **added with the first real UI flow (Phase 1 login)** | yes | —                                          |

## Test data and isolation

- The e2e global setup (`test/global-setup.ts`) drops and recreates a throwaway database `autonova_test` and applies **all migrations from zero** — so the migration chain is itself verified on every run. The dev database is never touched (the append-only audit log could not be cleaned up there).
- Tests create their own data with unique values; no test depends on another's rows. File parallelism is off for DB suites.
- Factories/builders are introduced when the second entity needs them (not before).
- Time-dependent rules (revisit date, overdue, expiry) take an injected clock.

## Coverage expectations

No global % gate yet (it would reward trivial tests). Instead, **mandatory scenarios** per flow, listed in its flow doc, must exist before the flow is marked done. Domain/state-machine code targets near-complete branch coverage; controllers are covered through e2e.

## Critical business scenarios (must always have tests as the phases land)

1. Unauthenticated → 401 on every protected route (a test enumerates routes and fails on any unmarked public route).
2. A BD user cannot read or edit another user's lead by ID (404).
3. Expired access token → 401; revoked/rotated refresh token reuse → session family revoked; disabled user's still-valid JWT rejected next request; concurrent refresh yields exactly one successor; Director cannot operate without TOTP. Full security test catalogue: [06](06-security-and-access-control.md#security-testing).
4. Disqualification requires a reason; revisit-later requires a date; override requires Director + reason.
5. Discount above threshold cannot be sent without Director approval.
6. A signed ToR version cannot be modified or deleted (API **and** direct SQL → trigger).
7. Conversion requires both signatures; quotation acceptance alone does not convert; replaying conversion creates no second client.
8. Money: partial payments, balance = total − allocations, no float drift, KES/USD never mixed.
9. Audit row written, in the same transaction, for each audited action.

## Quality gates before closing any flow

`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` and the e2e suite, plus `prisma migrate diff --exit-code` for drift. Claims in docs/progress reports must reflect tests that were actually run.

## Currently implemented tests

- packages: enums (3), contracts (2), validation (13, incl. password policy)
- api unit (53): env schema + production rules, error filter, validation pipe, enum parity, audit service/snapshot, password hasher, **session-authentication rule (every rejection reason), access-token service (round trip, wrong secret, expiry, alg:none, HS512, claim shape)**
- web unit (55): API response parsers and error normalisation, `can()` permission helper, and component specs with Testing Library + jsdom for the user list, invite form and user detail (loading/empty/error/denied/401 states, validation, duplicate email, double-submit guard, role change, disable confirmation, read-only view)
- api e2e (102 — incl. 44 for user administration, 31 login/me/logout/guard, 1 throttle): health/readiness, request-id, error envelope, security headers, Swagger; database integrity (unique/lower-case email, key checks, ACTIVE needs password, RESTRICT deletes, **audit append-only at both layers** — app-role privileges and owner-role triggers — and runtime-role least privilege); audit service transactionality (commit together, rollback both ways, SECURITY category); first-Director bootstrap (creates Director + audit, refuses second, race-safe, no account takeover)
- **Mutation-checked (user administration):** each of these was broken in turn and a test failed every time — guard ignoring required permissions, guard no longer failing closed on an undeclared route, allowing self role change, skipping session revocation on disable, writing the audit row outside the transaction, accepting `status` from the client, leaking `passwordHash` through the user select, and removing the director-set lock from role change and from disable. **Two mutations initially survived** (the lock removal on role change, and audit-outside-transaction); both revealed weak tests and were fixed by forcing real transaction overlap and by asserting the audit call receives a transaction client.
- **Mutation-checked (auth):** each security rule was removed in turn and a test failed every time — ignore user status, ignore revoked session, ignore subject mismatch, skip the restricted-session check, make `/auth/me` public, reveal inactive accounts in the login error. The full catalogue of auth e2e scenarios lives in `apps/api/test/auth.e2e-spec.ts`.
- **Mutation-checked:** the bootstrap race test was proven to fail (5 Directors created) when the advisory lock is removed. A first version of that test passed without the lock and was rewritten — see the comment in the test.
