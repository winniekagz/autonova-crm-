# Flow: Quotations

**Implementation status:** 🟡 Implemented and tested (SOW §4.6). Not built: email/WhatsApp delivery, a scheduler for automatic expiry, revision of a sent quote.

## Purpose

Present the commercial offer. **A quotation never converts a lead**: accepting one records the client's answer and touches neither the lead nor the ToR.

## Rules enforced

- Two kinds: **from a ToR** (`POST /leads/:id/quotations/from-tor`) copies the lines and totals of a **sent or later** version, and **quick** (`…/quick`) is a standalone quote with custom lines. A ToR draft cannot be quoted (`QUOTATION_TOR_NOT_SENT`).
- Number `QT-YYYY-NNNN` from the atomic number sequence. Validity date defaults to 30 days (setting) and must not be in the past.
- Status: `DRAFT → SENT → ACCEPTED | REJECTED`; `EXPIRED` when the validity date passes while the quote is open. Expiry is **derived on read**; `expireDue()` can persist it, but no scheduler runs it yet.
- A sent quote's lines and totals are frozen by trigger; only its status moves. Edits mean a new quote.
- Totals come from the same exact-decimal calculator as the ToR.
- PDF: `GET /leads/:id/quotations/:qid/pdf`.

## Permissions

`quotations:read` / `quotations:write` (BD and Director). Scoped to leads the caller may see.

## Audit

Created, status changed, PDF generated.

## Open questions

Numbering format and default validity (Q18) · immutability and revisions (Q19) · effect of acceptance before ToR signature (Q20; currently none).
