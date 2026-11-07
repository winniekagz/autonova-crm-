# Autonova CRM

Sales and client engagement management for Autonova Systems Limited: lead → qualification → scope/ToR → quotation → **signed ToR** → client → billing → support.

> **Core rule:** a lead becomes a client only after **both parties have signed the ToR**. Quotation acceptance or a stage change is never enough.

**Status:** Phase 0 complete; Phase 1 (auth and access control) in progress — security foundations done (DB role split, audit service, password hashing, first-Director bootstrap). No login yet. See [progress](docs/implementation/progress.md).

## Stack

pnpm monorepo · Next.js + Tailwind (`apps/web`) · NestJS (`apps/api`) · PostgreSQL + Prisma 7 · REST + Swagger · JWT (Phase 1) · zod validation · Vitest · Docker Compose.

## Layout

```
apps/api            NestJS modular monolith (REST, Prisma, Swagger)
apps/web            Next.js frontend
packages/config     shared tsconfig
packages/enums      shared enums (single source of values)
packages/contracts  shared API types (types only)
packages/validation shared zod primitives
infrastructure/docker  Dockerfiles
docs                requirements, architecture, flows, ADRs
```

`apps/worker` is intentionally not created yet (see [ADR-001](docs/decisions/ADR-001-modular-monolith.md)).

## Prerequisites

Node ≥ 20.19, pnpm 11 (`corepack enable`), Docker with Compose.

## Quick start

```bash
cp .env.example .env          # local dev defaults; never commit .env
pnpm install
pnpm db:up                    # PostgreSQL 16 on 127.0.0.1:5433
pnpm db:migrate               # apply migrations as the owner role (prisma migrate dev)
pnpm db:provision-app-role    # let the least-privilege runtime role `autonova_app` sign in
pnpm db:seed                  # seed the 4 system roles (idempotent)

# once, to create the first Director (no HTTP endpoint exists for this):
BOOTSTRAP_DIRECTOR_EMAIL=you@example.com BOOTSTRAP_DIRECTOR_NAME="Your Name" \
BOOTSTRAP_DIRECTOR_PASSWORD='a long passphrase' pnpm --filter @autonova/api run bootstrap:director
pnpm dev:api                  # http://localhost:4000  (docs: /api/docs)
pnpm dev:web                  # http://localhost:3000
```

### Full Docker stack and API reference

To run the database, API, and web app together in containers:

```bash
docker compose --profile app up -d --build
```

Open Swagger UI at <http://localhost:4000/api/docs>, download the OpenAPI JSON from
<http://localhost:4000/api/docs-json>, and open the web app at <http://localhost:3000>. The local
Compose stack enables Swagger for development and review. Configure the production API environment
with `SWAGGER_ENABLED=false` unless publishing the API reference is intentional. For the current endpoint inventory,
auth instructions, and stakeholder sharing guidance, see [API reference](docs/api-reference.md).

- Health: `GET /api/v1/health/live` (liveness), `GET /api/v1/health` (readiness incl. database)
- Swagger UI: <http://localhost:4000/api/docs> · OpenAPI JSON: `/api/docs-json`

Two database URLs exist on purpose: `MIGRATION_DATABASE_URL` (owner; migrations only) and `DATABASE_URL` (`autonova_app`; what the API uses). See [docs/06](docs/06-security-and-access-control.md#database-enforcement).

Full containerised stack (verifies the images build and run): `docker compose --profile app up --build`.

## Quality gates

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @autonova/api run test:e2e   # needs `pnpm db:up`; uses a throwaway autonova_test database
```

## Documentation

Start at [docs/02-architecture.md](docs/02-architecture.md) and [docs/03-implementation-roadmap.md](docs/03-implementation-roadmap.md). Business baseline: [docs/prd.md](docs/prd.md). Current state: [docs/implementation/progress.md](docs/implementation/progress.md).
