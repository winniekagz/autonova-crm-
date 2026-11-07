# Flow: Quotations

**Implementation status:** ⏳ Not started — Phase 6. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.6

## Actors and permissions

Present the commercial offer based on the agreed scope; it never converts a lead by itself.

## Rules from the PRD (Director and Business Development (draft/send); Finance read.)

- Generate from the latest ToR version, or a standalone quick quote.
- Managed number series, validity date; statuses draft/sent/accepted/expired/rejected.
- **Acceptance of a quote is not conversion.**

## Data (target model — see [04](../04-database-design.md))

`quotations` (+ lines), `number_sequences`.

## Open questions

Numbering format and default validity (Q18) · immutability after sending / revisions (Q19) · state effect of acceptance before ToR signature (Q20).
