# ADR-001: Modular monolith

**Status:** Accepted · 2026-11-07

## Context

A small team (initially two users, one or two developers) builds a CRM with strong transactional relationships (lead → ToR → client → invoices) and financial integrity needs. Operational capacity for running many services is minimal.

## Decision

One NestJS deployable and one PostgreSQL database, organised into modules with clear data ownership and a one-way dependency map ([02](../02-architecture.md)). A separate `apps/worker` process (same codebase and database) is added only when scheduled jobs need it.

## Alternatives considered

- **Microservices** — rejected: distributed transactions would complicate client conversion and payment allocation; operational cost with no scaling problem to justify it.
- **Single un-modularised app** — rejected: cross-module coupling would make later extraction or refactoring costly.

## Consequences

Cross-module consistency is a plain database transaction. Module boundaries rely on discipline and review (reading another module's data goes through its service). If a module ever needs independent scaling, its boundary is already defined.
