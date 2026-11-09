# Flow: Qualification (BANT)

**Implementation status:** 🟡 Implemented and tested (SOW §4.4). Weights, pass mark and rating values are **temporary defaults** pending PRD Q6–Q8.

## Purpose

Decide whether an opportunity is viable before scope and quotation effort is spent. A lead becomes **Qualified** only through a recorded BANT assessment.

## Rules enforced

- Assessment is recorded while the lead is in **Visits and calls**. Each assessment is a new, insert-only row (history kept; a DB trigger refuses update and delete).
- Four criteria (Budget, Authority, Need, Timeline), each rated Not met / Partly met / Fully met. The **server** scores them out of 100 with the configured weights and compares with the configured pass mark. The web app never calculates a score.
- `POST /leads/:id/qualify` is the **only** way to reach Qualified. The generic stage transition refuses it with `USE_QUALIFY_ENDPOINT`, so the BANT gate cannot be bypassed with a note.
- Latest assessment passed → the owner, or a Director, qualifies it.
- Latest assessment failed → only a **Director** may override, with a written reason (`OVERRIDE_REQUIRES_DIRECTOR` for anyone else). The override is flagged on the stage history and audited.
- No assessment → `QUALIFICATION_NOT_ASSESSED`.
- Ownership scope is the lead's: a BD user sees and assesses only their own leads.
- Disqualification and revisit-later are unchanged (see [lead management](./lead-management.md)).

## Endpoints

| Method and path                                               | Permission                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /leads/:id/qualification`, `GET …/qualification/history` | `leads:read`                                                  |
| `POST /leads/:id/qualification`, `POST /leads/:id/qualify`    | `leads:update` (override also needs `qualification:override`) |
| `GET /settings/qualification`                                 | `leads:read`                                                  |
| `PUT /settings/qualification`                                 | `settings:manage` (Director)                                  |

## Temporary defaults (change in settings, not code)

Weights 25 / 25 / 25 / 25, ratings worth 0 / 0.5 / 1 of a criterion's weight, pass mark 60. The settings response carries `isDefault: true` until a Director saves values, and the screen says so.

## Audit

Assessment recorded, lead qualified, override used (with the reason in the stage history), settings changed. Audit values use `threshold`/`result`/`fingerprint` keys because the audit service refuses keys that look like credentials.

## Open questions

BANT weights, scale and pass mark (Q6–Q7) · who may override beyond the Director (Q8).
