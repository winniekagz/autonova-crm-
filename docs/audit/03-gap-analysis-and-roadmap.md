# Autonova CRM — Gap Analysis and Delivery Roadmap

_Updated after the follow-on sprint, 7 November 2026. Estimates are engineering effort ranges, not calendar commitments. They exclude stakeholder decision latency and vendor procurement._

## Highest-impact gaps

| Rank | Gap                                                                   | Impact                                                                                                                                                                       | Dependency / suggested action                                                                                                        |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P0   | Director MFA administration and recovery operations remain incomplete | TOTP enrollment, verification, recovery, encryption, and audit now exist. Another-Director reset and a key rotation procedure do not.                                        | Add reviewed administrative reset controls and document/test key rotation before production use.                                     |
| P0   | Lead CRUD does not satisfy the CRM workflow                           | Lead capture, owned-record access, search, detail, and update exist; no activities, qualification, stages, ToR, signatures, or conversion exist. Phase 1 exit remains unmet. | Reconcile open lifecycle rules, then implement the next vertical slice through activity and qualification before ToR/signature work. |
| P1   | Role permissions and invitation lifecycle incomplete                  | Director and BD have only the explicit lead grants; Technical Lead and Finance have no lead access pending policy. Newly created users stay invited and cannot sign in.      | Resolve remaining permission policy; then add invitation acceptance/email and password recovery with expiration and audit.           |
| P1   | Product rules and phase boundaries remain open                        | Guessing risks schema/API rework, especially lifecycle, BANT, ToR, signature, VAT, discounts and account conversion.                                                         | Hold a focused decision session and record decisions in PRD/ADRs before dependent migrations.                                        |
| P1   | No PDF/signature, mail or storage integration                         | Required stakeholder artifacts and signature gate cannot be delivered or evidenced.                                                                                          | Choose providers and define fallback, audit evidence, signing method, templates and sandbox readiness.                               |
| P1   | No production operations evidence                                     | Backups, restore, observability, TLS, hosted deployment, secrets, retention and recovery objectives are unverified.                                                          | Define deployment owner/environment, threat controls, backup/restore runbook and operational acceptance before real data.            |
| P2   | Billing, payment, support, reminders and reporting absent             | Later lifecycle phases cannot run; substantial product/finance policy decisions remain.                                                                                      | Schedule after signed agreement conversion and validate dependencies on finance/provider decisions.                                  |
| P2   | Test/build/documentation drift                                        | Current docs can mislead developers and stakeholders; local Next build failure limits release confidence.                                                                    | Reconcile status docs; investigate build failure on supported host; add safe, isolated browser/E2E path.                             |

## Reuse and foundations

Retain the modular monolith, shared validation/contracts/enums, Prisma/Postgres, guarded Nest routes, uniform error envelope, audit service, role/session model, responsive UI primitives, and local Compose stack. These are useful foundations for CRM entities and screens. Keep signed-ToR invariants and audit requirements in both domain rules and durable database constraints where feasible. Reuse should not be interpreted as business functionality already delivered.

The follow-on sprint updated README status, implementation handover, endpoint inventory, auth/security docs, and Swagger endpoint schemas. Reconcile remaining historical checkpoints as needed. All sprint work remains uncommitted, per the user's instruction.

## Suggested sequence

| Stage                                           | Work                                                                                                                                                                             | Exit evidence                                                                                                                                    | Rough effort                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 0. Product/technical decisions                  | Approve phase boundary, lifecycle/transition rules, role matrix, BANT, ToR/signature, quote and conversion rules; choose providers; define privacy and operational requirements. | Decisions recorded and reviewed; API/data acceptance scenarios agreed.                                                                           | 2–5 person-days of product/engineering workshops and documentation.               |
| 1. Identity completion                          | TOTP MFA and recovery/reset; permission guard and approved feature grants; invitation acceptance/reset; unblock Director access; reconcile access docs.                          | Director can complete MFA; role-specific authorization tests; invited user can activate; audit trail verified.                                   | 5–10 engineering days, excluding email setup.                                     |
| 2. CRM foundation                               | Company/contact/lead models and APIs; dedupe warnings; ownership/visibility; stage transitions; activity reports and follow-up; responsive lead workflow.                        | BD can capture and progress a lead with activity history and authorization; migrations and safe integration tests.                               | 10–18 engineering days after decisions.                                           |
| 3. Qualification, scope, quote, signature       | BANT and revisit; catalogue; versioned ToR and quote; approval rules; PDF and signing evidence; immutable signed version; conversion gate.                                       | Representative lead completed to signed ToR PDF; both parties evidenced; quote acceptance alone cannot convert; repeat/concurrent requests safe. | 15–25 engineering days plus provider/legal review.                                |
| 4. Operational readiness and Phase 1 acceptance | Staging/deploy pipeline, backups/restore, observability, hardening, migration rehearsal, browser acceptance, user guide and walkthrough.                                         | Approved acceptance checklist complete in staging; restore demonstrated; stakeholder sign-off.                                                   | 5–10 engineering days plus deployment/provider lead time.                         |
| 5. Billing and client operations                | Account conversion, milestones, invoices, payments/reconciliation, subscription/reminders, dashboards, then support tickets/SLA.                                                 | Finance-approved billing scenarios and auditable support lifecycle.                                                                              | 15–30+ engineering days; payment/accounting integration scope may add materially. |

Ranges are deliberately broad. PDF/signature, offline operation, migration quality and external provider constraints are the largest estimate risks. A functional MVP is not production-ready until operational and privacy decisions are completed.

## Focused 10-hour development options

These were planning scenarios before the follow-on sprint. The completed sprint implemented MFA plus thin lead CRUD; it did not deliver the PRD's Phase 1 end-to-end outcome.

| Option                                  | Approximate 10-hour allocation                                                                                                                                           | Result and limitation                                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — unblock access first (recommended)  | 6h MFA enrollment/verification core; 2h recovery/session edge cases; 2h API/UI acceptance and current docs.                                                              | Director can use guarded admin functions if the flow is fully completed. Recovery/security review may still need follow-up; no CRM workflow delivered.                                           |
| B — expose a CRM skeleton               | 2h approved lead schema/API design; 5h minimal lead create/list/detail vertical slice; 2h authorization and tests; 1h docs.                                              | A thin lead slice only after role/visibility decisions. No qualification, ToR, signature, or conversion. MFA remains a usability blocker for Director.                                           |
| C — stakeholder-ready access and status | 4h reconcile README/API/progress/auth docs; 3h make local Swagger instructions reproducible; 2h stakeholder workflow/decision checklist; 1h safe quality-check guidance. | Easier developer/stakeholder orientation, but product capability does not advance. Swagger at localhost is not externally shareable; a hosted environment and publication decision are required. |

The technically safest sequencing is Option A, then resolve product decisions and build Option B as part of the approved CRM scope. The owner may choose another path based on demo priorities.

## Risk controls and acceptance gates

- Keep the ToR signature requirement as the only route to client conversion; test it against quote acceptance, one-party signature, duplicate/concurrent conversion, and version changes.
- Do not grant business permissions until the role/visibility matrix is approved. Maintain fail-closed authorization and test both allowed and denied cases.
- Treat test database setup as destructive: isolate it from development data and verify target DB identity before running suites that reset it.
- Do not use development Compose as deployment evidence. Verify TLS, proxy trust, secret rotation, least-privilege DB roles, backups and restore, monitoring, and access policies in the intended host.
- Establish retention and deletion policy for personal data and audit data with the responsible privacy/legal owner; append-only audit storage alone does not settle retention obligations.
- Keep stakeholder Swagger access on an approved environment with sanitized examples and explicit authentication instructions. Never share local credentials or real development data.
- Recheck formatting/build/test after isolating vendored skill files from project checks and diagnosing the host-specific Next build process failure.

## Decision log needed before feature implementation

The PRD's open questions should be closed in a short reviewed decision record: lifecycle/backward moves and reopen; duplicate policy and person-only leads; ownership/team visibility; BANT weights and override; ToR clauses, signature form/evidence, discount threshold, VAT rounding and change requests; quote numbering/validity; conversion idempotency/account cardinality; invoice and payment allocation/credit notes/overdue behavior; offline scope; notification recipients/retries; attachment constraints; provider selection and costs; privacy retention; backup location and RPO/RTO. These choices directly affect data models, authorization and acceptance tests.

## Definition of a credible Phase 1 completion

1. An approved user can authenticate, complete required MFA and receive only their permitted capabilities.
2. BD can create a lead, log a visit/call, qualify or disqualify it, and progress an approved scope.
3. The ToR/quote is versioned, rendered as a branded PDF, delivered through an approved channel, and signed with retained evidence by both parties.
4. Only the fully signed version can trigger a single auditable Won/client conversion; quote acceptance and partial signature do not.
5. Director/BD/Technical Lead/Finance access boundaries pass automated tests based on an approved matrix.
6. Staging acceptance, representative-data migration, backup/restore rehearsal, user guide and stakeholder walkthrough are complete.

The current repository does not meet these gates. Detailed current implementation evidence is in [`01-current-state.md`](01-current-state.md); feature-by-feature trace is in [`02-requirements-traceability.md`](02-requirements-traceability.md).
