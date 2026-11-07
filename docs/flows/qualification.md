# Flow: Qualification

**Implementation status:** ⏳ Not started — Phase 4. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.4

## Actors and permissions

Decide whether an opportunity is viable before scope and quotation effort is spent.

## Rules from the PRD (Director and Business Development qualify; override is Director-only with a reason.)

- BANT: Budget, Authority, Need, Timeline; total score out of 100; configurable pass mark.
- Move to Qualified only if passing, unless Director overrides **with a reason**.
- Disqualification reasons: no budget, no decision-maker, need doesn't fit, chose competitor, unresponsive, timing (revisit later), other. Revisit-later requires a date and auto-returns the lead to New lead on that date (needs the worker).

## Data (target model — see [04](../04-database-design.md))

`qualifications` (one per lead, history kept), `system_settings` for pass mark; audit of overrides.

## Open questions

BANT weights, scale and pass mark (Q6–7) · which roles qualify and what a Director may override (Q8).
