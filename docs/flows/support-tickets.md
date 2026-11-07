# Flow: Support tickets

**Implementation status:** ⏳ Not started — Phase 8. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.9

## Actors and permissions

Track client issues against the support level agreed in the ToR.

## Rules from the PRD (Technical Lead and Director manage tickets; BD **open**; Finance no access. No client portal (out of scope).)

- Ticket: title, priority, status, assignee, opened/resolved timestamps, time spent; linked to a client account.
- Response and resolution performance compared with the client's support plan.

## Data (target model — see [04](../04-database-design.md))

`support_tickets`, `ticket_time_entries`, SLA policy reference from the signed ToR plan.

## Open questions

Priority/status values (Q28) · SLA hours: business vs calendar, holidays (Q29) · targets and escalation (Q30).
