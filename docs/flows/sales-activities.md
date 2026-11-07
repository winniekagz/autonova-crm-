# Flow: Sales activities (calls, visits, follow-ups)

**Implementation status:** ⏳ Not started — Phase 3. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.3, §4.10

## Actors and permissions

Keep a structured history of every interaction with a lead and drive follow-up discipline.

## Rules from the PRD (Director (all), Business Development (own leads).)

- Report: date, type (visit/call/demo/meeting), attendees, location, notes, pain points, current tools, next steps, attachments (photos, voice notes, documents), optional GPS check-in.
- Linked to a lead; creator and time recorded; visible in the lead's history.
- Follow-ups scheduled with reminders; overdue follow-ups tracked.

## Data (target model — see [04](../04-database-design.md))

`activities`, `attachments` (metadata; storage provider TBD), `follow_ups`/tasks; index (lead_id, occurred_at), (due_at) for overdue.

## Open questions

Offline drafts: Phase 1 or Phase 3 — PRD conflict (Q35) · file size/type limits · storage provider · reminder recipients (Q31).
