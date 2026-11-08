# Flow: Lead management and pipeline

**Implementation status:** 🟡 SOW §4.1 lead capture is implemented (product catalogue, duplicate warning, next-action email reminders) together with lead CRUD and constrained lifecycle transitions. Companies/contacts linkage, qualification scoring, Won conversion, owner reassignment, and deployment of the recurring workers remain open.

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

## Product catalogue

`product_interest` is the `ProductInterest` enum (`RETAIL_POS`, `CAR_WASH_AUTOMATION`, `ERP`, `VISITOR_SECURITY_SYSTEM`, `HIRING_PLATFORM`, `CUSTOM_BUILD`), defined once in `@autonova/enums` with display names in `PRODUCT_INTEREST_LABELS`. The API, the database and the form all use the same keys; free text is rejected. The migration converted only unambiguous legacy text (exact catalogue key or label, ignoring case and punctuation); every other value became `NULL` and was kept in `legacy_product_interest`, which the API returns read-only and the detail and edit screens flag so a user can pick a product.

## Duplicate detection

Policy (decided: **warn, never block or merge** — the PRD acceptance criterion says "warns"; Q4 stays open for a stricter policy):

- Matching keys are stored with each lead, `phone_normalized` and `company_name_normalized` (indexed), and written by the API on every create/update from `domain/lead-duplicates.ts`. The migration backfill uses the same rules in SQL.
- Phone key: digits only, international form without `+`; a leading `0`, `00` or a bare 9-digit mobile number is read as Kenyan (`254…`). Values that cannot be a phone (fewer than 7 or more than 15 digits) have no key, so they never match.
- Company key: lower case, punctuation and spacing ignored, one trailing `Ltd`/`Limited`/`Plc`/`Inc`/`LLC` dropped. A match on either key is a possible duplicate.
- `POST /api/v1/leads/duplicate-check` returns the matches the caller may read (name, company, phone, stage, owner, why it matched, link) and a count of matches they may not. The count exists so the warning cannot be bypassed by hiding records; the hidden records are never described.
- `POST /leads` and `PATCH /leads/{id}` return **409 `LEAD_DUPLICATE_SUSPECTED`** when a match exists and the request lacks `acknowledgeDuplicates: true`. An edit is checked only when the phone or company key actually changes, so a known duplicate can still be edited. The acknowledgement is recorded in the audit event.
- Not guaranteed: two requests created at the same instant can both pass the check and both be saved. This is a warning, not a uniqueness constraint.

## Next-action reminders

- Table `lead_reminders`: one row per lead and follow-up instant (`UNIQUE(lead_id, due_at)`), with recipient, status (`PENDING`/`SENT`/`FAILED`/`SKIPPED`), attempts, last attempt, sent time, and a coded reason. Rows cannot be deleted by the application role.
- Worker: `pnpm --filter @autonova/api leads:send-reminders` (one-shot, builds first). Each run (1) queues a row for every active lead whose `next_action_at` has arrived — one atomic `INSERT … ON CONFLICT DO NOTHING`, so repeats and parallel runs add each reminder once; (2) leases due rows with `FOR UPDATE SKIP LOCKED` so two workers never send the same one; (3) re-checks the lead and recipient and emails the **lead owner**; (4) records the outcome and an audit event (`lead.reminder_sent|skipped|retrying|failed`).
- Everything is stored in the database, so restarts and downtime lose nothing: the next run picks up whatever is due. Rescheduling the follow-up creates a new reminder for the new time.
- Delivery rules (`domain/lead-reminder-policy.ts`): skipped, with a reason, if the lead is Won/Lost/Disqualified, the follow-up changed, the owner is disabled, has no email or cannot read leads, or the follow-up is more than 3 days overdue (also prevents a flood after a long outage). Failed deliveries retry after 5 min, 15 min, 1 h, 4 h; after 5 attempts the row is `FAILED` and the command exits non-zero. Missing SMTP is recorded as `SMTP_NOT_CONFIGURED` and retried — it is never reported as sent.
- Delivery is at-least-once: if the process dies after the email left but before the row is marked sent, the lease expires and it is sent again.
- Time: the follow-up is stored as an instant. The form picks a Nairobi calendar day and stores 09:00 Africa/Nairobi (UTC+3, no DST); the email and the UI show Nairobi time whatever the browser's timezone.
- `GET /api/v1/leads/{id}/reminders` (same visibility as the lead) feeds the "Follow-up reminders" section on the lead screen, which shows status, attempts and the reason, and says plainly when a follow-up is overdue but nothing has been recorded.
- **Not included:** the recurring schedule itself (this repository configures no cron/scheduler; run both workers on a timer, e.g. every 5–15 minutes), in-app notifications, daily digest, WhatsApp/SMS, and any recipient other than the owner.
