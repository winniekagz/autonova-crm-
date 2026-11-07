# 03 — Implementation roadmap

Vertical slices: each flow goes UI → API → auth → use case → domain → Prisma → PostgreSQL and is verified before the next starts. A flow is "done" only when it meets the quality gates in [08](08-development-conventions.md).

| Phase | Scope                                                                                                                                                                                                                   | Depends on | Status      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| 0     | Foundation: monorepo, Docker, Nest, Next, Prisma, health, Swagger, docs                                                                                                                                                 | —          | ✅ Complete |
| 1     | Auth and access control (accounts, login/logout, refresh rotation, session revocation, **Director TOTP MFA**, `/me`, password reset, roles/permissions, authorization, audit service, DB role split, encrypted backups) | 0          | Next        |
| 2     | Companies and contacts, duplicate detection                                                                                                                                                                             | 1          | —           |
| 3     | Leads, pipeline stages/transitions, activities (calls, visits, attachments), follow-ups                                                                                                                                 | 2          | —           |
| 4     | Qualification (BANT), disqualification, revisit, override, stage moves                                                                                                                                                  | 3          | —           |
| 5     | Scope catalogue, ToR versions, discounts/approval, PDF, send, signatures, lock, change requests                                                                                                                         | 4          | —           |
| 6     | Quotations, **conversion to client** (both signatures verified)                                                                                                                                                         | 5          | —           |
| 7     | Invoices, payments, partial payments, subscriptions, reminders                                                                                                                                                          | 6          | —           |
| 8     | Support tickets, SLA                                                                                                                                                                                                    | 6          | —           |
| 9     | Dashboards and reporting, Excel/PDF export                                                                                                                                                                              | 3–8        | —           |
| 10    | Integrations (M-Pesa, email, WhatsApp/SMS, eTIMS), jobs, production readiness                                                                                                                                           | 7          | —           |

## Sequencing notes (validated dependencies)

- **Phase 1 precedes everything**: every endpoint needs authentication, ownership checks need users, and audit needs an actor.
- **Phase 3 needs Companies (Phase 2)**: a lead references a company; this avoids repeating company data per lead.
- **Phase 5 attachments/PDF** introduces file storage (provider TBD, PRD §7.1) — decide at the start of Phase 3 (visit attachments) rather than Phase 5.
- **Email is Phase 1 in the PRD** (ToR delivery) but is only needed from Phase 5; Phase 1 password reset needs an email _interface_ with a log/console adapter until a provider is chosen.
- **Phase 6 conversion** depends on Phase 5 signature capture; do not build conversion earlier "to see it work".
- **`apps/worker`** is created when the first scheduled job lands (Phase 3 revisit-later re-entry / follow-up reminders).
- PRD Phase 1 exit criterion: _Sam can take a real lead from capture to a signed ToR PDF without leaving the system_ — that is the end of roadmap Phase 6 (minus quote acceptance details), so intermediate phases must be demoable on their own.

## Recommended first flow

Phase 1 → **First-Director bootstrap, then login + current user (with Director TOTP and per-request session/user checks)**. The security design ([06](06-security-and-access-control.md) v0.2) is the sign-off artefact. See the handover in [implementation/progress.md](implementation/progress.md).
