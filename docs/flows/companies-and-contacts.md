# Flow: Companies and contacts

**Implementation status:** ⏳ Not started — Phase 2. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.2

## Actors and permissions

Represent an organisation separately from its people and its sales opportunities, so company data is never duplicated into each lead.

## Rules from the PRD (Director (all), Business Development (create/edit; visibility of others' companies is **open**).)

- One company → many contacts (owner, manager, finance…) and many deals over time.
- Company: name, KRA PIN, location, industry, staff count, branches, website/social. Contact: name, title, phone, email, WhatsApp, decision-maker flag.
- Duplicate detection on phone and company name.
- Acceptance: multiple contacts per company; multiple leads per company; contact details not the only copy of company data inside a deal.

## Data (target model — see [04](../04-database-design.md))

`companies`, `contacts`; KRA PIN partial-unique; normalised phone/name columns for duplicate checks; archive instead of delete.

## Open questions

Company merge behaviour · contact de-duplication · warn vs block on duplicates and phone normalisation (Q4) · can an individual lead exist without a company (Q3).
