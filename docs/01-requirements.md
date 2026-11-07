# 01 — Requirements

The business baseline is the PRD: [prd.md](prd.md). This file is a **working index**: it records what engineering treats as confirmed, what is assumed, and what is open. It does not restate the PRD. Nothing here is invented policy.

## Actors

Four roles (PRD §2.1): Director/Admin, Business Development, Technical Lead, Finance. Roles are data, not hard-coded to people. Initial users: Sam (BD), Augustine (Technical Director).

## Non-negotiable rules (PRD §1.1, §2.2, §6.4, §13)

1. Lead → client **only** when both parties have signed the ToR. Conversion is idempotent.
2. A signed ToR is immutable; later changes are change requests / new versions.
3. Discount above the configured threshold needs Director approval before the ToR can be sent.
4. Qualification override: Director only, reason required.
5. Disqualification and loss reasons are retained; "revisit later" needs a date.
6. Money: exact decimals, explicit currency (KES default, USD supported); VAT 16% or exempt.
7. Every important change is auditable (actor, time, old/new value, reason where required).
8. Authorization enforced on the API.
9. Finance cannot edit scope.

## Out of scope (PRD §11)

Client self-service portal, marketing automation, Instagram integration, payroll, commissions, HR.

## Open decisions

Tracked in [implementation/progress.md](implementation/progress.md#open-decisions). Each is mapped to the phase that is **blocked** by it, so none needs answering before its phase starts. Highest-impact first:

| #      | Question (PRD §12.2)                                                                         | Blocks                        |
| ------ | -------------------------------------------------------------------------------------------- | ----------------------------- |
| Q4     | Permission-matrix "Confirm" cells (BD visibility of others' leads, Tech Lead edit rights, …) | Phase 1 authorization seeding |
| Q1     | Is Disqualified a stage or an outcome? Pipeline stage labels                                 | Phase 3                       |
| Q3     | Can a lead exist without a company?                                                          | Phase 2/3                     |
| Q4b    | Duplicate detection: warn or block; phone normalisation                                      | Phase 2/3                     |
| Q6–8   | BANT weights, scale, pass mark                                                               | Phase 4                       |
| Q12–17 | Signature methods/evidence, ToR vs change-request boundary, VAT rounding                     | Phase 5                       |
| Q22–26 | Invoice numbering, allocation, credit notes, overdue/suspension                              | Phase 7                       |
| Q35    | Offline drafts: Phase 1 or Phase 3 (PRD conflict)                                            | Phase 3                       |

## Phase mapping note

The PRD names three delivery phases (Pipeline / Billing / Service). The engineering roadmap ([03](03-implementation-roadmap.md)) subdivides them into vertical slices; PRD P1 ≈ roadmap phases 1–6, P2 ≈ 7, P3 ≈ 8–9.
