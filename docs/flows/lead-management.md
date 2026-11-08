# Flow: Lead management and pipeline

**Implementation status:** 🟡 Lead CRUD and constrained lifecycle transitions are implemented. Qualification scoring, Won conversion, and recurring scheduler deployment remain open.

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

## Implemented lifecycle slice

The current API uses one enum stage: `NEW_LEAD → VISITS_AND_CALLS → QUALIFIED → SCOPE_ALIGNMENT → TOR_QUOTE_SENT`, with `DISQUALIFIED`, `WON`, and `LOST` terminal states. Disqualification is currently modeled as a stage with a separate reason; this is an implementation choice pending product confirmation of Q1. Forward-only transitions are available from server-derived lifecycle options. `QUALIFIED` requires a written qualification note; formal BANT scoring and a pass mark are not implemented. A lead at `TOR_QUOTE_SENT` can be marked `LOST` only with a reason. Won has no API transition and remains reserved for signed-ToR conversion.

Disqualification is available from `VISITS_AND_CALLS`. `TIMING_REVISIT_LATER` requires a date; other reasons cannot include one. A durable `revisit_on` date is processed by the one-shot command `pnpm --filter @autonova/api leads:process-revisits`. The processor uses Nairobi calendar dates, transactional compare-and-set, transition history, and audit logging, making retries and concurrent invocations safe. Deployment must invoke this command on a recurring schedule; this repository does not configure that scheduler. Existing leads receive no fabricated history during migration; history starts with the first recorded transition.

Manual lifecycle endpoints require the existing `leads:update` permission and preserve the existing Director-all / Business Development-own scope. Generic lead PATCH cannot change stage or outcome. Backward transitions and reopening Lost are not supported pending Q2.

### Lifecycle endpoints

- `POST /api/v1/leads/{id}/transitions` — advance one allowed stage; qualification requires a note.
- `POST /api/v1/leads/{id}/disqualification` — set a reason and optional required revisit date.
- `POST /api/v1/leads/{id}/lost` — mark a ToR/quote-stage lead Lost with a reason.
- `GET /api/v1/leads/{id}/history` — paginated, append-only stage history.
