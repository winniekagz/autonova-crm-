# Flow: Terms of Reference

**Implementation status:** 🟡 Implemented and tested (SOW §4.5): versioned ToR, server-side pricing, discount approval, PDF, send, dual typed-name signature, lock. **Not built:** email/WhatsApp delivery, OTP, drawn signature, signed-scan upload, change requests, a ToR template/clause library.

## Purpose

The authoritative, versioned record of scope, price, timeline and agreement. When both parties sign the same version, the deal converts ([client conversion](./client-conversion.md)).

## Lifecycle

`DRAFT` → `SENT` → `SIGNED`, or `SENT` → `SUPERSEDED` when a new round starts.

1. **Create** (`POST /leads/:id/tor`): lead must be Qualified, Scope alignment or ToR/quote sent. One ToR per lead. v1 is a DRAFT. The lead moves to **Scope alignment**. Number `TOR-YYYY-NNNN`.
2. **Edit the draft** (`PUT …/tor/draft`). Editing clears any discount approval.
3. **Send** (`POST …/tor/send`): records the SHA-256 content hash, freezes the version, moves the lead to **ToR/quote sent**. Refused with `TOR_NOTHING_IN_SCOPE` (no in-scope item) or `TOR_DISCOUNT_APPROVAL_REQUIRED`.
4. **New round** (`POST …/tor/versions`, 201): copies the sent version into a new DRAFT and marks the sent one `SUPERSEDED`. Item identity (`itemKey`) carries across versions so the diff can show added, removed, changed and scope-flipped items. Out-of-scope items are kept.
5. **Sign** (`POST …/versions/:n/sign`): see below.

## Pricing (server only)

Money is exact: BigInt cents, half-up rounding, decimal strings on the wire. The discount applies to the **one-off subtotal** (setup fee + in-scope items + add-ons), never to the recurring plan. VAT (16%, or exempt) is applied once to the net one-off amount and once to the recurring plan. The web app sends inputs and shows the totals the server returns; the PDF uses the same stored figures.

## Discount approval

A discount **strictly above** the threshold (default 10%) cannot be sent until a Director approves it (`POST …/tor/approve-discount`, `tors:approve`). Approval is bound to the draft and cleared by any edit.

## Immutability

A SENT or SIGNED version, and its scope items, add-ons, milestones and signatures, cannot be changed: enforced by the application **and** by database triggers. The app role also has UPDATE/DELETE/TRUNCATE revoked on the evidence tables. Catalogue items are **copied** into a ToR, so later catalogue edits never alter it.

## Signatures

Two parties, **CLIENT** and **AUTONOVA**, one signature each per version (unique). Phase 1 records a **typed name** confirmed by staff, with an optional evidence note ("signed scan received by email"). Each signature stores the version's content hash. The Autonova signer must be a Director (decision S5 open). A signature on a version that is not SENT, is superseded, or whose lead is closed (Lost/Disqualified) is refused. The second signature locks the version and converts the deal in the same transaction.

## Permissions

BD: `tors:read`, `tors:write`, `catalogue:read`. Director: all, plus `tors:approve`, `catalogue:manage`. Technical Lead and Finance have none yet (decision pending). All routes are scoped to leads the caller may see.

## Audit

Created, draft updated, discount approved, sent, new version, signed, converted, PDF generated.

## Open questions

Signature methods and OTP provider (Q12–13) · version vs change-request boundary (Q14) · withdrawing a sent ToR (Q15) · discount threshold and workflow (Q16) · VAT exemption and rounding (Q17) · template and clauses (Q11) · catalogue owner (Q9) · who signs for Autonova (S5).
