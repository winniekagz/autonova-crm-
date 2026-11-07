# Flow: Billing and payments

**Implementation status:** ⏳ Not started — Phase 7. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.8

## Actors and permissions

Invoice setup and recurring fees, record payments (including partial), and know exactly what each client owes.

## Rules from the PRD (Finance and Director (invoices, payments, reconciliation); BD and Technical Lead no access.)

- Invoice types: setup, recurring, add-on; invoice number, amount, VAT, due date, status, method (M-Pesa, bank, cheque), reference.
- Setup invoices follow the signed ToR payment terms (deposit/milestones/balance); recurring invoices auto-raised monthly/quarterly/annually.
- Partial payments and outstanding balances; reminders (−7d, due, +7d); flag/suspend overdue accounts.
- Money is exact decimal with explicit currency; invoices and payments are never deleted.

## Data (target model — see [04](../04-database-design.md))

`invoices`, `invoice_lines`, `payments`, `payment_allocations`, `subscriptions`; balance = total − allocations (computed).

## Open questions

Invoice numbering (Q22) · deposit/milestone representation (Q23) · allocation of a payment across invoices (Q24) · refunds, credit notes, overpayments (Q25) · overdue threshold and automatic vs approved suspension (Q26) · renewal changes/pauses (Q27) · billing timezone.
