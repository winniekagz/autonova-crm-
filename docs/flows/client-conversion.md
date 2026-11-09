# Flow: Client conversion

**Implementation status:** 🟡 Implemented and tested (SOW §4.7): automatic, idempotent, transactional conversion on the second signature. Client accounts are **read-only**; there is no onboarding, billing or support yet.

## Purpose

Turn a deal into a client account when both parties have signed the same ToR version, and at no other moment.

## Rules enforced

- Trigger: the **second** distinct party signs the same SENT version. Quote acceptance, a verbal agreement or a stage change never convert.
- In one transaction: lock the ToR row, re-read the lead and refuse a non-open lead (`TOR_LEAD_CLOSED`), lock the version, create the account `CL-YYYY-NNNN` from the signed version, move the lead to **Won** (source `CONVERSION`), write audit.
- **Idempotent:** one account per signed version (unique `signed_tor_version_id`) and per lead. A repeated or concurrent second signature fails on the party-unique constraint and creates nothing. Tested with concurrent requests.
- The account snapshots the signed content: company, plan name, billing cycle and amount, go-live date from the milestones, and a link to the signed version. Later catalogue or ToR changes cannot alter it.
- Clients are visible only to people who may see the originating lead. `GET /clients`, `GET /clients/by-lead/:leadId`, `GET /clients/:id` (`clients:read`). No create, edit or delete route exists, and a trigger blocks changes to the signed link.

## Not built / unresolved

Onboarding, subscriptions and invoicing; a company with several signed deals (currently one account per signed deal, Q21); reopening a Lost deal (Q2); a Director repair action; change requests after signing.
