# Flow: Companies and contacts

**Implementation status:** 🟡 Implemented and tested (SOW §4.2): companies, contacts, lead–company–contact links, duplicate handling, archive/restore, visibility rules and the web screens. Not built: company merge, owner reassignment of companies, client-account linkage (SOW §4.7), contact de-duplication beyond a warning-free model, and any caching.

## Purpose

§4.2. Represent an organisation separately from its people and its sales opportunities, so company data is never copied into each lead.

## Decisions (answered 2026-11-08; none of these were settled in the PRD)

| Question (PRD §4.2 / §12.2 Q3, Q4)                             | Decision                                                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Can a lead exist without a company?                            | **Yes** — an individual prospect has `company_id = NULL`. Existing leads without company text stay that way.                                                                   |
| Lead ↔ company                                                 | A lead has **at most one** company; a company has **many** leads over time.                                                                                                    |
| Lead ↔ contact                                                 | An optional **primary contact** (`leads.primary_contact_id`) plus any number of **additional contacts** (`lead_contacts`, max 20). Contacts must belong to the lead's company. |
| Company visibility for Business Development                    | Own only: companies they created or that have one of their own leads. Directors see all. See [06](../06-security-and-access-control.md).                                       |
| Duplicate companies                                            | Same **KRA PIN** = same legal entity: refused, cannot be confirmed away. Same **normalised name** = warning, can be confirmed.                                                 |
| Can a contact belong to several companies? Unique phone/email? | **No** to the first (one company for life, enforced by a trigger); **no** uniqueness on phone or email (colleagues share them).                                                |
| Deleting a company                                             | **Archive**, never delete (the app database role cannot `DELETE`). Refused while the company has open leads. Archiving releases the KRA PIN. Restore is possible.              |
| Company merge                                                  | **Not built.** Remains an open product question.                                                                                                                               |

## Data model

- `companies`: name, `name_normalized`, optional KRA PIN (format `A123456789B`, partial-unique among non-archived rows), location, industry (enum), staff count, branch count, website, up to 10 social links (`text[]`), archive columns, created/updated-by, `needs_review`.
- `contacts`: company (immutable), name, job title, phone (+ `phone_normalized`), email (lower-case, CHECKed), WhatsApp, `is_decision_maker`, archive timestamp. Several decision-makers per company are allowed.
- `lead_contacts`: lead ↔ additional contact. `leads.company_id` and `leads.primary_contact_id` are new nullable foreign keys; a CHECK forbids a primary contact without a company.
- Database triggers keep the cross-table rules true even for code that bypasses the API: a contact's company never changes; a lead's primary and additional contacts always belong to the lead's company.
- `leads.company_name` is kept as the text captured at entry. Once a lead is linked, the company record is the only source of the name (the lead DTO, search, reminder emails and the duplicate panel all read it from there); the text column is not written any more.
- Indexes follow the queries: `companies(name_normalized)` (search, duplicate check), `companies(created_by_user_id)` and `leads(company_id, owner_user_id)` (the visibility filter and per-owner counts), `contacts(company_id, archived_at)` (a company's active contacts), `lead_contacts(contact_id)` and `leads(primary_contact_id)` (restrict-on-delete checks and "is this contact in use"). No index on contact email or phone: nothing searches by them yet, and unused indexes only slow writes.

## Existing lead data (migration `20261108190000_companies_and_contacts`)

- `leads.company_name` is never modified. Every distinct normalised name becomes one company and its leads are linked to it; leads without a company name stay individual prospects.
- A group whose original spellings differ (for example "Acme Ltd" and "ACME Limited") is **linked but flagged `needs_review = true`** instead of being silently trusted; nothing is merged beyond the documented normalisation (case, spacing, punctuation, one trailing Ltd/Limited/Plc/Inc/LLC). There is no screen for the review flag yet: it is queryable (`SELECT … FROM companies WHERE needs_review`).
- Each created company gets a `company.created` audit event with `source = legacy_lead_company_text`.
- The dev database held one lead, so it produced one company. The backfill's grouping, flagging and non-destructiveness were tested on seeded rows in a scratch database and in the e2e suite.

## API (see [api-reference](../api-reference.md))

Companies: `GET/POST /companies`, `POST /companies/duplicate-check`, `GET/PATCH /companies/{id}`, `POST /companies/{id}/archive|restore`, `GET /companies/{id}/leads`. Contacts: `GET/POST /companies/{companyId}/contacts`, `GET/PATCH /contacts/{id}`, `POST /contacts/{id}/archive|restore`. Leads: `PATCH /leads/{id}/relationships`; `POST /leads` accepts `companyId`, `primaryContactId`, `additionalContactIds`.

## Rules enforced by the backend

- Required: company name, contact name and decision-maker flag. KRA PIN: letter + 9 digits + letter, stored upper-case without spaces. Counts 0–1,000,000 (staff) and 0–10,000 (branches). Website and social links must be `http(s)` URLs. Unknown or system-managed fields are rejected (`strict` schemas).
- Duplicate check on create, and on edit only when the name or PIN actually changes. `POST /companies/duplicate-check` returns `exact` (PIN), `potential` (name) and `hiddenMatchCount`; archived companies are included so they can be restored instead of duplicated. Saving: `409 COMPANY_KRA_PIN_EXISTS` (never bypassable) or `409 COMPANY_DUPLICATE_SUSPECTED` until `acknowledgeDuplicates: true`; the acknowledgement is audited.
- Lead duplicate detection no longer compares company names: several leads for one company are expected. It compares phone only.
- Audit: `company.created|updated|archived|restored`, `contact.created|updated|archived|restored`, `lead.relationships_changed`, all written in the same transaction as the change with the actor, before/after values and request id.
- Rate limits (existing throttler): company and contact creation 30 and 60 per minute, duplicate check 60 per minute, per address, on top of the global 300 per minute. A person adding a company and its contacts is far below this.
- Caching: none. Lists are paginated, selected column-by-column, and counted with one grouped query per page (no N+1); with the indexes above they are cheap, and a cache would have to be keyed per user because of the visibility rule.

## Web

Routes `/companies`, `/companies/new`, `/companies/{id}`, `/companies/{id}/edit`; a "Companies" navigation link for users with `companies:list`. The lead form chooses a company and contacts (server-searched, debounced picker); the lead page has a "Company and contacts" section to link or change them. Every screen has loading, empty, error and permission-denied states, and destructive actions ask for confirmation.

## Known limitations and open questions

- No company merge. No screen for `needs_review` companies.
- A company created by one BD user who never owns a lead there stays visible only to its creator and Directors.
- A lead owned by a BD user makes the whole company (name, contacts) visible to them, including contacts added by others. Changing this needs a decision.
- Reassigning a lead's owner is not built; when it is, company visibility will follow automatically (it is derived from lead ownership).
- Companies cannot yet be linked to a client account (SOW §4.7); the `company_id` foreign key is the hook.
- Two simultaneous requests can both pass the name warning (it is a warning, not a uniqueness rule); the KRA PIN rule is a database unique index and cannot race.
