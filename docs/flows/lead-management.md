# Flow: Lead management and pipeline

**Implementation status:** ⏳ Not started — Phase 3. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§3.2–3.3, §4.1

## Actors and permissions

Capture and manage every prospect and opportunity, with exactly one pipeline stage at a time.

## Rules from the PRD (Director (all), Business Development (own leads); Technical Lead access **open**.)

- Required fields: name, company, phone, email, source (referral/Instagram/website/walk-in/event/cold outreach/existing-client upsell), referrer (if referral), product interest (Retail POS, Car Wash Automation, ERP, Visitor/Security System, TalentHub, Custom Build), notes, estimated value (KES/USD), stage, owner, next action + date, probability.
- Quick-add mobile form, under two minutes.
- Stages: New lead → Visits and calls → Qualified → Scope alignment → ToR and quote sent → Won / Lost; Disqualified / revisit later (revisit returns to New lead on its date).
- **Won only via signed ToR** — never by a stage drag.

## Data (target model — see [04](../04-database-design.md))

`leads`, `lead_stage_history`; stage + separate outcome/reason; optimistic `version`; owner FK to users; index (owner_id, stage), (next_action_at).

## Open questions

Stage/outcome model — is Disqualified a stage or outcome (Q1) · backward moves and reopening Lost (Q2) · BD visibility after reassignment (Q5) · mandatory fields.
