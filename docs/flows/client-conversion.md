# Flow: Client conversion

**Implementation status:** ⏳ Not started — Phase 6. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.7, §6.4, §13

## Actors and permissions

Turn a deal into a client account at the moment both parties have signed the ToR — and at no other moment.

## Rules from the PRD (System action triggered by the final signature; Director can view/repair via audited admin action.)

- Preconditions: both parties' signatures recorded on the same ToR version.
- Effects (one transaction): deal → Won; create exactly one client account; link signed ToR, milestones, subscription; audit.
- **Idempotent:** repeated callbacks/retries create no duplicate (UNIQUE on the signed ToR version).
- Quote acceptance, verbal agreement or a stage change are never sufficient.

## Data (target model — see [04](../04-database-design.md))

`client_accounts` (go-live, plan, billing cycle, next renewal, status; balance computed), UNIQUE(signed_tor_version_id).

## Open questions

Company with several signed deals — one or several client accounts (Q21) · who may reopen Lost deals (Q2).
