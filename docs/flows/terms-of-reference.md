# Flow: Terms of Reference

**Implementation status:** ⏳ Not started — Phase 5. Stub: records PRD-sourced rules and open questions only; the full flow definition (journeys, endpoints, tests) is written in the Design step of that phase, before code.

## Purpose

§4.5

## Actors and permissions

The authoritative, versioned record of scope, price, timeline and agreement — the contract that triggers client conversion when signed by both parties.

## Rules from the PRD (BD drafts; Technical Lead estimates/reviews scope; Director approves discounts over threshold; Finance read-only; edit rights on commercial fields **open**.)

- Scope items (catalogue or custom): description, in/out-of-scope, estimate days, price. Each alignment round = new version v1, v2…; change log; dropped requests kept.
- Commercials: setup fee, currency KES/USD, optional discount, hosting/support plan (cycle + amount), add-ons, payment terms, VAT 16% or exempt, milestones.
- Branded PDF from saved data; send by email/WhatsApp; signature (typed name + OTP, drawn, or signed scan); **signed version locked**; later changes via change request.
- Discount above threshold (e.g. 10%) cannot be sent without Director approval.

## Data (target model — see [04](../04-database-design.md))

`tors`, `tor_versions`, `scope_items`, `tor_milestones`, `tor_signatures` (UNIQUE per version+party), `change_requests`, `catalogue_items`; DB trigger blocks changes to signed versions; content hash of signed PDF.

## Open questions

Signature methods and evidence (Q12–13) · version vs change-request boundary (Q14) · withdraw/edit a sent ToR (Q15) · discount threshold and workflow (Q16) · VAT exemption and rounding (Q17) · template and clauses (Q11) · catalogue/price-list owner (Q9).
