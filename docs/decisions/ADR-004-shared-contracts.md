# ADR-004: Shared packages — contracts, enums, validation

**Status:** Accepted · 2026-11-07

## Context

Frontend and API need one source of truth for enum values and response shapes, without coupling the frontend to Prisma or replacing server-side validation.

## Decision

- `@autonova/enums`: const-object enums (runtime values + union types). Only persisted/API-exchanged enums.
- `@autonova/contracts`: **types only** describing API responses (error envelope, pagination, health). Never imports Prisma or Nest.
- `@autonova/validation`: small zod primitives reused by API and web (email, uuid, pagination). Request schemas for a specific endpoint live in the API next to its controller.
- All three compile to `dist` and are consumed via `exports`.
- The Prisma enum `UserStatus` duplicates `@autonova/enums` `UserStatus`; a test must keep them equal when the auth flow starts using it (Prisma schema cannot import TS).

## Alternatives considered

One mega `shared` package (rejected: unclear ownership). Generating the frontend client from OpenAPI (deferred: revisit when endpoint count makes hand-written types costly). Re-exporting Prisma types (rejected: breaks the boundary).

## Consequences

Persisted enum changes remain data migrations. Shared types can drift from the API if not reviewed; mitigated by the Swagger document and e2e tests asserting response shapes.
