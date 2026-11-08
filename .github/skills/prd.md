Autonova Sales CRM & Client Engagement System
Product Requirements Document (PRD)
Document status: Engineering baseline --- draft for stakeholder
validation
Source: Autonova Systems Limited --- Sales CRM & Client Engagement
System, Scope of Work for Development, prepared 6 November 2026
Product owner / business stakeholders named in source: Sam (Business
Development), Augustine (Technical Director)
Initial users: Sam and Augustine, with provision for future sales,
technical, finance and support staff
Proposed implementation: Full-stack TypeScript monorepo using
Next.js, NestJS and Docker
Primary market/context: Autonova Systems Limited, Nairobi, Kenya
Currency defaults: KES; USD also supported
Source fidelity note: This PRD expands the supplied Scope of Work
into an engineering-oriented product specification. Requirements
explicitly stated in the source are described as requirements.
Decisions not specified by the source are marked TBD,
Proposed, or Engineering recommendation so they are not
mistaken for approved business rules.

1. Product overview
1.1 Product description
Autonova Sales CRM & Client Engagement System is an internal business
application for managing the complete lifecycle of a sales opportunity
and the resulting client relationship.

The product provides one system of record for the journey from first
contact through sales qualification, client meetings, requirements and
scope alignment, quotation, Terms of Reference (ToR) approval and
signature, client-account creation, billing, recurring subscriptions and
support.

Today, lead details, visit notes, scopes and quotations are spread
across chats, documents and individual memory. This makes it difficult
to see the complete sales pipeline, understand what each client owes,
preserve agreed scope, track follow-ups and report on business
performance.

The system will bring these activities together and implement Autonova's
delivery method:
1. Capture and follow up a lead.
2. Record calls, visits, demos and meetings.
3. Qualify or disqualify the opportunity with a recorded reason.
4. Align the scope with the client, retaining each revision.
5. Integrate additions and deletions into a final agreed scope.
6. Generate the quotation from the final scope.
7. Obtain both parties' signatures on the ToR.
8. Execute according to the agreed timelines.
9. Convert the signed deal into a client account.
10. Manage invoices, payments, renewals and support.
Core business rule: A lead becomes a client only after both sides
have signed the ToR. Acceptance of a quotation alone does not trigger
client conversion.
1.2 Product vision
Give Autonova one reliable operational view of every opportunity and
client: what was requested, what was agreed, who is responsible, what is
being delivered, what has been billed and paid, and what support remains
outstanding.
1.3 Product goals
The system must enable Autonova to:
- Capture every lead with source, contact and need in under two
  minutes, including from a phone.
- Record every client visit or call as a structured report linked to
  the relevant lead.
- Qualify or disqualify leads against defined criteria and retain the
  reason.
- Produce a versioned Terms of Reference covering system scope, setup
  fee, hosting and support plan, timelines and payment terms.
- Obtain and preserve signatures from both parties on the agreed ToR.
- Convert a signed ToR into a client account.
- Manage setup billing, recurring billing and renewal alerts.
- See pipeline value, conversion rates and recurring revenue on a
  dashboard.
- Preserve an audit history of important changes.
1.4 Product success measures
The source specifies the following intended outcomes and dashboard
measures. Numeric targets beyond those explicitly stated are not yet
defined.
  Measure                             Definition / intended view
  Lead capture speed                  Capture a lead in under 2 minutes,
including on a phone

  Pipeline visibility                 Count and value of deals in each
pipeline stage

  Weighted pipeline                   Deal value multiplied by its
probability

  Conversion                          Leads → qualified → ToR sent →
signed, with drop-off percentage

  Lead-source performance             Leads and conversions by source

  Disqualification                    Count by disqualification reason

  Sales activity                      Visits and calls logged per person
per week

  Follow-up discipline                Overdue follow-ups

  Setup revenue                       Setup fees signed versus collected

  Recurring revenue                   Monthly Recurring Revenue (MRR)
from hosting and support

  Renewal visibility                  Renewals due in 30, 60 and 90 days

  Receivables                         Outstanding invoices aged 0--30,
31--60, 61--90 and 90+ days
Support performance                 Open tickets and average resolution
time per client
Proposed operational measures to validate: percentage of leads with
an owner and next-action date; time from lead creation to first contact;
ToR turnaround time; percentage of signed ToRs with complete scope and
commercial information. These are useful product analytics but are not
explicit acceptance metrics in the source.
2. Users, roles and access control
Permissions are role-based, not person-based. The first release has four
roles.
2.1 Roles
Director / Admin
Named initial users: Sam and Augustine.

Capabilities: - Full system access. - Manage settings and users. -
Manage the product and price list. - Approve ToRs and discounts. -
Delete records. - View all revenue. - Override a qualification result,
with a recorded reason. - Review and approve discounts above the
configured threshold.
Business Development
Intended users: Sales staff, including future staff.

Capabilities: - Create and edit their own leads. - Create and edit their
own visit reports. - Qualify leads. - Draft ToRs and quotations. - View
their own pipeline.

The source does not explicitly define whether Business Development can
view shared company/contact records, other users' deals, or records
after reassignment. Those access rules require confirmation.
Technical Lead
Named initial user: Augustine; future developers may also use this
role.

Capabilities: - Review scope items. - Estimate scope items. - Mark
technical feasibility. - Log delivery milestones. - Manage / log support
tickets.

The precise permission to edit ToR commercial fields, approve final
scope, or change a signed ToR is not specified. Signed ToRs must remain
locked.
Finance
Intended user: Accountant, future role.

Capabilities: - View signed ToRs. - Raise invoices. - Reconcile
invoices. - Record payments. - No permission to edit scope.
2.2 Permission principles
- Enforce permissions on the server/API, not only by hiding frontend
  controls.
- Every change must record the acting user, timestamp and old/new
  value.
- Discounts above a configurable threshold (example in source: 10%)
  require Director approval before the ToR can be sent.
- Directors can override qualification failure only with a reason.
- Finance can work with invoices and payments but cannot edit scope.
- A signed ToR is locked; subsequent changes must use a change
  request.
2.3 Permission matrix
The matrix below translates the source into an initial implementation
view. "Confirm" means the source does not define the permission
precisely enough.
  Capability           Director/Admin       Business Technical Lead        Finance
Development                
  Manage users and                Yes             No             No             No
settings                                                          

  Manage                          Yes             No        Confirm             No
product/price list                                                

  View all revenue                Yes             No        Confirm  Finance views
needed for
work

  Create leads                    Yes      Own leads        Confirm             No

  Edit leads                      Yes      Own leads        Confirm             No

  View pipeline                   All   Own pipeline        Confirm             No

  Log visits/calls                Yes      Own leads        Confirm             No

  Qualify leads                   Yes            Yes        Confirm             No

  Override                Yes, reason             No             No             No
qualification              required                               

  Review/estimate                 Yes          Draft            Yes             No
scope                                                             

  Draft ToR/quote                 Yes            Yes   Scope input;             No
confirm final
edit rights 

  Approve ToR                     Yes             No        Confirm             No
technical
review 

  Approve discount                Yes             No             No             No
threshold
exception                                                         

  Sign/lock ToR         Director-side    Client-side             No             No
signature      signature
workflow                

  View signed ToRs                Yes        Confirm Yes, as needed            Yes

  Create/reconcile                Yes             No             No            Yes
invoices                                                          

  Record payments                 Yes             No             No            Yes

  Edit scope               Yes before     Draft only   Scope review             No
signature;                        before
signed version                     signature
locked                               

  Manage support                  Yes        Confirm            Yes             No
tickets                                                           
Delete records                  Yes             No             No             No
Important: This is a proposed permission baseline derived from role
descriptions, not a substitute for stakeholder approval. Confirm all
"Confirm" cells before implementing production authorization policies.
3. Product lifecycle and state model
3.1 End-to-end lifecycle
1. New lead: A prospect is captured with contact details, source,
   product interest, owner and next action.
2. Visits and calls: Interactions are logged against the lead.
3. Qualification: BANT criteria are scored. The lead either passes,
   is disqualified, or is marked for later revisit.
4. Scope alignment: Business and technical stakeholders define the
   requested solution. Scope rounds are versioned.
5. ToR and quote sent: The agreed scope and commercial terms are
   documented and sent to the client.
6. Signature decision:
   - Both sides sign: deal becomes Won and a client account is
     created.
   - Deal does not proceed: mark Lost and record the reason.
7. Client account: The account holds the signed ToR, project
   milestones, active subscription, invoices, payments and support
   tickets.
8. Billing and renewals: Setup and recurring invoices are managed;
   payments and balances are reconciled.
9. Support: Client issues are tracked against the support plan and
   service level.
3.2 Lead/deal stages
Every deal must sit in exactly one stage.

The source names these stages and transitions:
- New lead
- Visits and calls
- Qualified
- Scope alignment
- ToR and quote sent
- Won
- Lost
- Disqualified / revisit later handling
The source's pipeline diagram distinguishes disqualified leads and lost
deals. "Revisit later" leads return to New Lead on the follow-up date.
For implementation, retain the outcome and reason as well as the active
stage so reporting can distinguish disqualification from a deal that was
lost after progressing.

Proposed state representation: use a single current pipeline stage
plus separate outcome/reason fields where necessary. Do not infer that
"Disqualified" and "Lost" are interchangeable: - Disqualified: the
opportunity fails qualification criteria. - Lost: an opportunity
that progressed but did not result in a signed ToR. - Revisit later:
a disqualification/revisit outcome with a scheduled return to New Lead.

Confirm the exact stage labels and whether Disqualified is a stage or a
terminal outcome before finalizing the enum.
3.3 Transition rules
  From              Event / condition To                Required data /
action
  New Lead          Interaction       Visits and calls  Record activity
begins                              

  Visits and calls  Qualification     Qualified         BANT score and
passes                              result

  Visits and calls  Qualification     Disqualified      Reason required
fails                               

  Disqualified      Reason is timing  Revisit later     Follow-up date
/ revisit later                     required

  Revisit later     Follow-up date    New Lead          Automatically
reached                             re-enter pipeline

  Qualified         Scope work begins Scope alignment   Scope round
created

  Scope alignment   Final scope       ToR and quote     Current ToR
priced and        sent              version and
ToR/quote sent                      quotation

  ToR and quote     Both sides sign   Won               Signed version
sent              ToR                                 locked; create
client account
ToR and quote     Deal does not     Lost              Lost reason
sent              proceed                             required
TBD: define whether users can move backwards between active stages,
who can reopen a Lost deal, and whether a ToR can be withdrawn or
resent.
4. Functional requirements
Priority labels: - P1: Required for Phase 1 go-live. - P2: Phase
2. - P3: Phase 3. - TBD: Priority or detailed behavior needs
stakeholder confirmation.
4.1 Leads (P1)
Purpose
Capture and manage every potential customer and sales opportunity.
Required fields
- Lead/person name.
- Company.
- Phone.
- Email.
- Lead source.
- Referrer name when source is referral.
- Product interest.
- Notes.
- Estimated deal value (KES as default; support USD where applicable).
- Stage.
- Owner.
- Next action and date.
- Probability percentage.
Product catalogue options
- Retail POS.
- Car Wash Automation.
- ERP.
- Visitor/Security System.
- Hiring Platform (TalentHub).
- Custom Build.
Requirements
- Provide a quick-add, mobile-first form.
- Support lead capture in under two minutes.
- Support the listed lead sources: referral, Instagram, website,
  walk-in, event, cold outreach and existing-client upsell.
- Check for duplicates using phone number and company name.
- Allow lead ownership assignment.
- Capture next action and follow-up date.
- Remind the assigned user about the next action.
- Link leads to companies, contacts, visits, qualification and ToRs.
- Track estimated value and probability for pipeline reporting.
Acceptance criteria
- A user can create a lead with the required fields from a phone-sized
  screen.
- Referral source captures the referrer's name.
- Product interest is selected from the Autonova catalogue.
- The system warns about a possible duplicate based on phone or
  company.
- A lead has an owner and next-action date.
- A lead appears in the correct pipeline stage and owner's pipeline.
TBD: whether duplicate detection blocks saving or only warns;
whether phone/company matching is exact or normalized; which fields are
mandatory.
4.2 Companies and contacts (P1)
Purpose
Represent an organization separately from its people and sales
opportunities.
Company fields
- Company name.
- KRA PIN.
- Physical location.
- Industry.
- Company size: staff count and number of branches.
- Website/social details.
Contact fields
- Name.
- Title.
- Phone.
- Email.
- WhatsApp number.
- Decision-maker flag.
Requirements
- One company can have several contacts, such as owner, manager and
  finance contact.
- One company can have several deals over time.
- Link contacts to a company.
- Link deals to a company and relevant contacts.
- Support company association with a client account after conversion.
Acceptance criteria
- Multiple contacts can be associated with one company.
- A company can have multiple leads/deals.
- Contact details are not duplicated as the only source of company
  data inside each deal.
TBD: company merge behavior, contact deduplication, and whether an
individual lead can exist without a company.
4.3 Visit and call reports (P1)
Purpose
Keep a structured history of client/prospect interactions.
Fields
- Date.
- Type: visit, call, demo or meeting.
- Attendees.
- Location.
- Discussion notes.
- Client pain points.
- Current tools used.
- Next steps.
- Attachments.
Requirements
- Each report must be linked to a lead/deal.
- Support attachments including photos, voice notes and documents such
  as existing forms or price lists.
- Optional GPS check-in for site visits.
- Track who created the report and when.
- Support field use on a mobile device.
Acceptance criteria
- A user can create a visit/call report against a lead.
- The report captures interaction type, date, discussion, pain points
  and next steps.
- A user can attach relevant files.
- Reports are visible in the lead's activity/history view.
Phase note: offline saving and later synchronization are listed as
Phase 3, although the technical requirements call offline visit-report
drafts a "nice to have for Phase 1." This is a scope ambiguity to
resolve. Do not silently treat offline sync as a Phase 1 commitment.
4.4 Qualification (P1)
Purpose
Determine whether an opportunity is viable before investing in scope and
quotation work.
Qualification framework: BANT
- Budget confirmed.
- Authority: decision-maker met.
- Need clearly defined.
- Timeline to go live.
Requirements
- Score each criterion per lead.
- Calculate a total score out of 100.
- Use a configurable pass mark.
- Move a lead to Qualified only when it passes, unless a Director
  overrides with a reason.
- Require a disqualification reason from:
  - No budget.
  - No decision-maker.
  - Need doesn't fit.
  - Chose competitor.
  - Unresponsive.
  - Timing (revisit later).
  - Other.
- "Revisit later" requires a follow-up date.
- Automatically return revisit-later leads to New Lead on the
  follow-up date.
Acceptance criteria
- Qualification captures the four BANT dimensions and total score.
- The configured pass mark determines the default result.
- A non-passing lead cannot be marked Qualified without Director
  override and reason.
- Disqualification requires a reason.
- Revisit-later requires a follow-up date and automatically re-enters
  the pipeline on that date.
TBD: scoring weights, pass mark, whether each criterion uses numeric
scores or defined choices, and whether a Director can override any
disqualification reason or only qualification score.
4.5 Terms of Reference / scope agreement (P1)
Purpose
Create the authoritative record of what Autonova will build, what is
excluded, what it will cost, when it will be delivered and what the
client has agreed to pay.

This is the core commercial and delivery agreement in the product.
Scope builder
- Add modules and features from a reusable catalogue.
- Allow custom line items.
- Each scope item must contain:
  - Description.
  - In-scope / out-of-scope flag.
  - Technical estimate in days.
  - Price.
- Support additions and deletions during client scope-alignment
  rounds.
- Save each round as a new version (v1, v2, v3, etc.).
- Retain a change log showing what was added, removed or changed.
- Preserve dropped requests as part of the historical record.
Commercials
- One-off setup/development fee.
- Currency: KES or USD.
- Optional discount.
- Hosting and support plan:
  - Monthly, quarterly or annual billing cycle.
  - Amount per period.
  - Description of what it covers, such as hosting, backups,
    updates, support hours and response time.
- Optional add-ons:
  - Training days.
  - Hardware (printers, scanners, tablets).
  - Data migration.
  - SMS bundles.
- Payment terms, for example:
  - Deposit percentage.
  - Milestone payments.
  - Balance on go-live.
- VAT: 16% applied or shown as exempt.
Timelines
Support delivery milestones and target dates, including examples: -
Requirements sign-off. - Demo. - UAT. - Go-live. - Training.
Document generation
- Generate a branded PDF ToR from saved system data.
- Use Autonova colours and logo.
- Include the relevant scope, exclusions, commercials, payment terms
  and milestones.
Sign-off
- Send ToR by email or WhatsApp link.
- Support electronic signature using typed name plus OTP or drawn
  signature, or upload of a signed scan.
- A signed version is locked.
- Any subsequent change must be captured as a change request.
Approval and integrity requirements
- Director approval is required for discounts above the configured
  threshold (example: 10%) before the ToR can be sent.
- Preserve the exact ToR version that was signed.
- Record signatures and signed date.
- Do not allow editing of a signed version.
Acceptance criteria
- A user can build a ToR from catalogue items and custom line items.
- Every scope item has description, in/out-of-scope status, estimate
  and price.
- Each scope-alignment round creates a retrievable version and change
  history.
- The ToR contains setup fee, recurring hosting/support plan, add-ons,
  payment terms, VAT and milestones.
- The system generates a branded PDF from the saved ToR version.
- The ToR can be sent for client sign-off.
- The system can record both parties' sign-off through an approved
  Phase 1 method.
- Once signed, the exact version is locked.
- A post-signature change is handled as a change request, not by
  editing the signed version.
- An over-threshold discount cannot be sent until Director approval is
  recorded.
TBD: exact document template and clauses; signature evidence
requirements; OTP delivery provider; whether
typed-name/drawn-signature/upload are all Phase 1 options or
alternatives; change-request workflow; tax rounding and exempt-item
behavior; whether the ToR itself or a linked approval record stores each
party's signature.
4.6 Quotations (P1)
Purpose
Present the commercial offer based on the agreed scope.
Requirements
- Generate a quote from the latest ToR version.
- Support a standalone quick quote for simple deals.
- Generate a quote number from a managed number series.
- Store validity date.
- Track status:
  - Draft.
  - Sent.
  - Accepted.
  - Expired.
  - Rejected.
Acceptance criteria
- A quote can be generated from the latest ToR version.
- A standalone quote can be created for a simple deal.
- Quote number and validity date are stored.
- Status can be tracked through the defined lifecycle.
TBD: quote numbering format, whether a quote is immutable after
sending, and how quote acceptance relates to ToR signature. The signed
ToR remains the client-conversion trigger.
4.7 Conversion and client accounts (P2)
Purpose
Create the operational client record once the deal is formally agreed.
Conversion trigger
Both parties have signed the ToR.
Requirements
On successful signature: - Mark the deal Won. - Automatically create a
Client Account. - Attach the signed ToR. - Associate project
milestones. - Associate the active subscription. - Provide a place for
invoices, payments and support tickets.
Client account fields
- Go-live date.
- Active plan.
- Billing cycle.
- Next renewal date.
- Balance.
- Account status.
Acceptance criteria
- Signing both sides of the ToR changes the deal to Won.
- Exactly one client account is created for the conversion event.
- The signed ToR is linked to the client account.
- The account is associated with its company and related
  billing/support records.
Engineering recommendation: make conversion idempotent so repeated
signature callbacks or retries cannot create duplicate client accounts.
Define how to handle a company with multiple signed deals.
4.8 Billing and subscriptions (P2)
Purpose
Manage setup revenue, recurring hosting/support revenue, invoices,
payment records and receivables.
Requirements
- Invoice setup fees according to agreed payment terms:
  - Deposit.
  - Milestones.
  - Balance.
- Raise recurring hosting and support invoices automatically on the
  selected monthly, quarterly or annual cycle.
- Record payments by:
  - M-Pesa.
  - Bank transfer.
  - Cheque.
- Support part payments and outstanding balances.
- Send reminders:
  - Example: 7 days before due.
  - On due date.
  - 7 days after due.
- Suspend or flag accounts overdue beyond a configurable number of
  days.
- Show invoice status and account balance.
Invoice/payment record fields
- Invoice number.
- Invoice type: setup, recurring or add-on.
- Amount.
- VAT.
- Due date.
- Status.
- Payment method.
- M-Pesa/bank reference.
Acceptance criteria
- Setup invoices reflect the payment terms in the signed ToR.
- Recurring invoices are created on the selected billing cycle.
- Full and partial payments can be recorded.
- Outstanding balances update correctly.
- Renewal and overdue reminders are generated according to configured
  rules.
- An account can be flagged or suspended according to the configured
  overdue threshold.
TBD: invoice statuses; credit notes, refunds and reversals;
allocation of one payment across multiple invoices; treatment of
overpayments; billing timezone; invoice numbering; grace periods;
suspension/unsuspension rules; and whether suspension is automatic or
requires human approval.
4.9 Support tickets (P3)
Purpose
Track client issues and measure service performance against the support
level agreed in the ToR.
Requirements
- Log issues against a client account.
- Capture priority.
- Assign a responsible person.
- Track status.
- Record time spent.
- Record opened and resolved timestamps.
- Track response and resolution time against the support level in the
  ToR.
Support ticket fields
- Title.
- Priority.
- Status.
- Assignee.
- Opened date/time.
- Resolved date/time.
- Time spent.
Acceptance criteria
- A ticket is linked to a client account.
- A ticket has priority, status and assignee.
- Time spent is recorded.
- Response and resolution performance can be compared with the
  client's support plan.
TBD: priority values, ticket statuses, SLA calendar/business hours,
response-time measurement, escalation rules and whether clients can
submit tickets directly. A client self-service portal is out of scope
for now.
4.10 Notifications and tasks (cross-cutting; channel phasing to confirm)
Requirements
- Daily digest covering:
  - Follow-ups due.
  - Visits planned.
  - ToRs awaiting signature.
  - Invoices due.
- In-app notifications.
- Email notifications.
- WhatsApp/SMS where integrated.
Acceptance criteria
- Users can see relevant due tasks and reminders.
- Daily digest includes the listed categories.
- Notifications are associated with the relevant lead, ToR, invoice or
  client account.
TBD: recipient rules, user notification preferences, retry behavior,
delivery logs, quiet hours and exact phase for each channel. Email is
Phase 1; WhatsApp/SMS integration is Phase 2 in the source.
5. Dashboard and reporting requirements
5.1 Main dashboard
The home dashboard must answer: 1. What is in the pipeline? 2. What are
we converting? 3. What recurring revenue do we hold?
5.2 Required dashboard/report widgets
Pipeline
- Deal count per stage.
- Deal value per stage.
- Weighted value: value × probability.
Conversion funnel
- Leads → Qualified → ToR sent → Signed.
- Drop-off percentage at each step.
- Filters by period, source and product.
Disqualification analysis
- Disqualification reasons by count.
Lead sources
- Which channels generate leads.
- Which channels generate converted clients.
Activity
- Visits and calls per person per week.
- Overdue follow-ups.
Revenue
- Setup fees signed versus collected.
- MRR from hosting and support.
- Renewals due in 30/60/90 days.
Receivables
- Outstanding invoices grouped by age:
  - 0--30 days.
  - 31--60 days.
  - 61--90 days.
  - 90+ days.
Support
- Open tickets.
- Average resolution time per client.
5.3 Export
All reports must export to: - Excel. - PDF.

TBD: report-specific filters, date definitions, timezone, export
permissions and whether dashboard values are real-time or periodically
refreshed.
6. Core data model
This is a conceptual domain model for engineering planning, not a final
normalized schema. Exact table structure, optionality, deletion behavior
and relation cardinalities must be confirmed during technical design.
6.1 Core records
User
System identity, role assignment and audit actor.
Lead / Deal
Name, company, phone, email, source, referrer, product interest,
estimated value (KES default), stage, owner, next action/date and
probability.
Company
Name, KRA PIN, industry, location, branches, staff count and
website/social details.
Contact
Name, title, phone, email, WhatsApp and decision-maker flag; linked to a
company.
Visit Report
Date, type, attendees, location, notes, pain points, current tools, next
steps and attachments; linked to a deal.
Qualification
Budget, authority, need and timeline scores; total; result;
disqualification reason; revisit date; linked to a deal.
ToR
Version number, scope items, exclusions, setup fee, discount,
hosting/support plan and cycle/amount, add-ons, payment terms,
milestones, VAT, status, signatures and signed date; linked to a deal,
quotation and client account.
Scope Item
Module/feature, description, in/out-of-scope status, estimate in days
and price; linked to a ToR version and catalogue item where applicable.
Client Account
Go-live date, active plan, billing cycle, next renewal, balance and
account status; linked to company, ToR, invoices and tickets.
Invoice / Payment
Number, type (setup/recurring/add-on), amount, VAT, due date, status,
payment method and M-Pesa/bank reference; linked to client account.
Payments should be independently represented if multiple or partial
payments are to be supported.
Support Ticket
Title, priority, status, assignee, opened/resolved timestamps and time
spent; linked to client account.
6.2 Additional supporting records implied by the requirements
The following supporting records are engineering recommendations
required to implement the described behavior cleanly. They are not all
separately enumerated as records in the source:
- Product catalogue and scope-item catalogue.
- ToR version and scope-alignment change log.
- ToR signature/approval evidence.
- Change request.
- Quotation.
- Subscription / recurring plan.
- Invoice line item.
- Payment allocation / reconciliation record.
- Activity/task/reminder.
- File attachment metadata.
- Notification and delivery attempt.
- Audit event.
- Milestone.
- Role and permission configuration.
6.3 Relationship principles
- A company can have multiple contacts.
- A company can have multiple deals over time.
- A deal can have multiple visit reports.
- A deal has qualification information and can have multiple ToR
  versions.
- A ToR version has scope items.
- A ToR can produce one or more quotations, subject to the agreed
  commercial workflow.
- A signed ToR converts a deal into a client account.
- A client account is associated with a company and signed ToR.
- A client account has invoices, payments and support tickets.
- Users own/perform activities and are recorded on audit events.
6.4 Data integrity rules
- Every deal has exactly one current pipeline stage.
- Disqualification and loss reasons must be retained.
- Revisit-later requires a date.
- Qualification override requires a Director and reason.
- Signed ToR versions cannot be edited.
- Changes after signature are represented as change requests/new
  agreement versions according to an approved workflow.
- A conversion event must not create duplicate client accounts.
- Financial records must preserve enough history to explain balances
  and payment allocations.
- Important changes record user, time and old/new value.
7. Proposed technical architecture
The business scope does not mandate a stack. The following is the
proposed implementation direction based on the engineering decision to
use NestJS, Next.js, a TypeScript monorepo and Docker.
7.1 Architecture overview
- Frontend: Next.js application for the internal CRM.
- Backend: NestJS API exposing authenticated business operations.
- Shared packages: TypeScript contracts, enums, validation schemas
  and shared utilities where appropriate.
- Database: relational database recommended because the domain has
  strong relationships, transactional workflows and financial records.
  Specific database engine is TBD.
- File storage: object/file storage for attachments and generated
  PDFs. Provider is TBD.
- Background processing: scheduled jobs and a queue/worker for
  reminders, recurring invoices, follow-up re-entry, PDF tasks and
  integration callbacks. Exact technology is TBD.
- Containerization: Docker for local development and deployable
  services.
- Integrations: email, PDF, e-signature, M-Pesa, WhatsApp/SMS,
  eTIMS and accounting export according to phase.
7.2 Monorepo proposal
A possible structure:
autonova-crm/
├── apps/
│   ├── web/                    # Next.js CRM frontend
│   ├── api/                    # NestJS API
│   └── worker/                 # Background jobs (if separated)
├── packages/
│   ├── contracts/              # Shared API DTO types / response contracts
│   ├── enums/                  # Shared domain enums and constants
│   ├── validation/             # Shared schemas where runtime-compatible
│   ├── config/                 # Shared lint, TS and formatting config
│   └── utils/                  # Pure cross-platform utilities only
├── infrastructure/
│   ├── docker/
│   └── scripts/
├── docs/
│   ├── PRD.md
│   ├── architecture.md
│   └── decisions/
├── docker-compose.yml
├── package.json
├── tsconfig.base.json
└── README.md
This is a proposed layout, not a source requirement. Workspace tooling
(pnpm/npm/yarn) is TBD.
7.3 Shared types and enums
Share stable domain contracts between the frontend and backend, for
example: - UserRole. - LeadSource. - ProductInterest. - DealStage /
DealOutcome (after stage semantics are confirmed). -
QualificationResult. - DisqualificationReason. - VisitType. -
ScopeInclusionStatus. - ToRStatus. - QuoteStatus. - BillingCycle. -
InvoiceType. - InvoiceStatus. - PaymentMethod. - AccountStatus. -
TicketPriority. - TicketStatus. - NotificationChannel.

Important engineering guidance: - Shared TypeScript types do not
replace backend validation. - NestJS must validate incoming requests at
runtime. - Do not import backend entities/ORM models into the
frontend. - Keep API request/response contracts separate from
persistence models. - Avoid duplicating enum values between frontend and
backend; maintain one shared source where safe. - Treat persisted enum
changes as data migrations, not just code edits. - Do not expose
internal-only fields through shared response contracts.
7.4 API design principles
Proposed API characteristics: - Versioned API namespace,
e.g. /api/v1. - Authentication and authorization enforced
server-side. - DTO validation at request boundaries. - Consistent error
response format. - Pagination, filtering and sorting for list
endpoints. - Explicit state-transition operations for important
workflows rather than arbitrary stage updates. - Idempotency for
conversion, payment callbacks and other retryable operations. - Audit
events for business-critical mutations. - OpenAPI/Swagger documentation
generated from NestJS contracts.

Potential API resource groups: - /auth - /users - /roles -
/leads - /companies - /contacts - /activities or
/visit-reports - /qualifications - /scope-catalogue - /tors -
/tor-versions - /change-requests - /quotations -
/client-accounts - /subscriptions - /invoices - /payments -
/support-tickets - /tasks - /notifications - /reports -
/files - /audit-logs

These are planning candidates, not a finalized endpoint contract.
7.5 Docker and environments
Dockerize the application services to make local setup and deployment
consistent.

Proposed local services: web, API, database, and any required
worker/queue or object-storage emulator. Exact service list depends on
technology selection.

Environments should be separated at minimum into local development,
staging and production. Secrets must be supplied through environment
configuration/secret management and must not be committed to the
repository.
8. Non-functional requirements
8.1 Responsiveness and field usability
- Web application.
- Responsive and usable on a phone for lead capture and visit reports.
- Lead capture should take under two minutes.
8.2 Connectivity
- Must work on slow connections.
- Visit report drafts saving offline and syncing later are described
  as a Phase 1 nice-to-have in the technical requirements.
- Offline sync is also listed in Phase 3. This conflict must be
  resolved in the phase baseline.
8.3 Security
- Role-based access.
- Encrypted passwords.
- Two-factor login for Directors.
- Enforce authorization on backend operations.
8.4 Backups
- Automated daily backups.
- Retain backups for at least 30 days.
8.5 Auditability
- Full audit trail on ToRs, prices and invoices.
- The general role section additionally says every change is logged
  with user, time and old/new value.
8.6 Privacy and compliance
- Handle client personal data in accordance with the Kenya Data
  Protection Act 2019.
- Define data access, retention, export and deletion policies with the
  business owner and appropriate compliance advice.
8.7 Branding
- Autonova dark navy and electric blue/cyan.
- Autonova logo in the app and generated PDFs.
8.8 Currency
- KES is the default.
- USD is supported for regional clients.
- Store currency with monetary values; do not assume every amount is
  KES.
TBD: performance targets, availability target, recovery time
objective (RTO), recovery point objective (RPO), supported browsers,
file size/type limits, accessibility target, data retention period and
exact encryption requirements.
9. Integrations and delivery phases
  Integration             Purpose                 Source phase
  Email (SMTP / Google    Send ToRs, quotes,      Phase 1
Workspace)              invoices and reminders  

  PDF generation          Branded ToR, quote and  Phase 1
invoice documents       

  Basic e-signature       Client ToR sign-off     Phase 1

  Full OTP-based          Client sign-off         Phase 2
e-signature                                     

  M-Pesa Daraja API       STK push on invoices;   Phase 2
(Paybill/Till)          automatically match
payments by reference   

  WhatsApp Business API   Reminders and ToR       Phase 2
or SMS gateway          signing links
(e.g. Africa's Talking)                         

  KRA eTIMS               Tax-compliant invoices  Phase 2
Accounting export       Finance hand-off        Phase 3
(QuickBooks / Excel)
Integration requirements should be implemented behind provider
abstractions where practical, so the business workflow does not depend
directly on one vendor's SDK.

TBD: credentials and accounts, provider selection, webhook security,
retry/reconciliation policy, sandbox access, message templates, delivery
cost ownership and integration test data.
10. Delivery plan and acceptance
Phase 1 --- Pipeline
Deliverables
- Leads.
- Companies and contacts.
- Visit reports.
- Qualification.
- ToR builder with versions.
- PDF ToR and quote.
- Basic e-signature.
- Won/Lost handling.
- Pipeline dashboard.
Phase 1 exit criterion
Sam can take a real lead from capture to a signed ToR PDF without
leaving the system.
Phase 2 --- Billing
Deliverables
- Client accounts.
- Setup and recurring invoices.
- Payments.
- M-Pesa.
- WhatsApp/SMS reminders.
- eTIMS.
- Revenue and receivables reports.
Phase 2 exit criterion
A signed ToR automatically produces its invoices and renewal reminders,
and an M-Pesa payment updates the balance.
Phase 3 --- Service
Deliverables
- Support tickets.
- SLA tracking.
- Accounting export.
- Offline sync.
- Advanced reports.
Phase 3 exit criterion
Tickets are tracked against each client's support plan.
Acceptance requirements for every phase
- All listed features are demonstrated on staging using real sample
  data, such as the Fashion POS and Boditeq deals.
- Existing live leads are migrated from current spreadsheets/notes.
- No critical bugs remain open.
- A user guide is provided.
- Users receive a one-hour walkthrough.
TBD: definition of critical bug, who signs acceptance, migration
reconciliation criteria, required test coverage and sign-off evidence.
11. Out of scope
The following are explicitly out of scope for the current release:
- Client self-service portal (clients logging in to view invoices and
  tickets).
- Marketing automation / bulk campaigns.
- Instagram integration.
- Payroll.
- Commissions.
- HR.
Do not include these as Phase 1 deliverables. Future extensibility may
be considered without implementing these features now.
12. Risks, dependencies and unresolved decisions
12.1 Key delivery risks
  Risk                    Why it matters          Mitigation / decision
  Unclear pipeline state  Can lead to             Approve stage/outcome
semantics               inconsistent            model before
transitions and reports implementation

  Undefined BANT scoring  Qualification cannot be Agree weights, scoring
implemented             and pass mark
consistently            

  ToR version/signature   Commercial agreement    Define version
ambiguity               integrity is central    snapshot, signature
evidence and lock
behavior

  Unclear discount        ToR may be sent without Define threshold,
approval flow           required approval       approver and approval
state

  Billing edge cases      Partial payments and    Define allocation,
recurring billing       reversal, credit and
affect balances         overdue rules

  Integration             M-Pesa/eTIMS/WhatsApp   Obtain credentials,
dependencies            require provider access sandbox access and
and testing             provider decisions
early

  Offline scope conflict  Phase 1 technical note  Confirm whether Phase 1
conflicts with Phase 3  requires offline drafts
delivery plan           

  Data migration quality  Existing leads may be   Profile
incomplete or           spreadsheets/notes and
duplicated              agree migration mapping

  Role ambiguity          Incorrect access can    Approve permission
expose                  matrix
commercial/client data  
Compliance obligations  Personal and financial  Validate privacy,
data require careful    retention and access
handling                requirements
12.2 Stakeholder questions requiring answers
Sales and pipeline
1. Are the pipeline stages exactly those listed in this PRD? Is
   Disqualified a stage, an outcome, or both?
2. Can a deal move backwards? Who can reopen a Lost deal?
3. Are all leads required to have a company, or can an individual
   prospect exist independently?
4. Does duplicate detection warn or block? How should phone numbers be
   normalized?
5. Can Business Development view another salesperson's lead after
   reassignment?
Qualification
6. What are the BANT weights and pass mark?
7. What input scale is used for each BANT criterion?
8. Which roles can record qualification, and can Directors override any
   failed result?
Scope and ToR
9. Who owns the reusable module/feature catalogue and price list?
10. Who approves technical estimates and feasibility?
11. What is the approved ToR template and required legal/commercial
    wording?
12. Which signature methods must be available in Phase 1?
13. What constitutes valid evidence of client and Autonova signature?
14. What exact action creates a new ToR version versus a change request?
15. Can a sent but unsigned ToR be edited, withdrawn or superseded?
16. What is the discount approval threshold and approval workflow?
17. How should VAT exemption and rounding work?
Quotes
18. What is the quote numbering convention and default validity period?
19. Can sent quotations be revised, and how are old versions retained?
20. Does quote acceptance have any state effect before ToR signature?
Client accounts and billing
21. Can one company have multiple active client accounts for different
    signed deals?
22. What are the invoice numbering rules?
23. How are deposits, milestones and go-live balances represented?
24. How are partial payments allocated across invoices?
25. How are refunds, reversals, credit notes and overpayments handled?
26. What overdue period triggers flagging or suspension, and is
    suspension automatic?
27. How are renewals changed, cancelled or paused?
Support
28. What are the priority and ticket-status values?
29. How are SLA hours calculated (business hours, calendar hours,
    holidays)?
30. What are the response/resolution targets and escalation rules?
Notifications and integrations
31. Who receives each reminder and daily digest?
32. Which email, WhatsApp and SMS providers/accounts will be used?
33. What is the required behavior when a provider is unavailable?
34. Who supplies M-Pesa, eTIMS and other integration credentials?
35. Is offline visit-report drafting required in Phase 1 or Phase 3?
Delivery and operations
36. Which existing spreadsheets/notes must be migrated, and who
    validates the migrated records?
37. Who is the acceptance signatory for each phase?
38. What are the performance, uptime and backup restoration
    expectations?
39. What data retention and deletion rules should apply?
13. Engineering principles and implementation guardrails
1. Preserve business history. Do not overwrite signed commercial
   agreements or erase scope-alignment history.
2. Model business transitions explicitly. Use domain operations for
   qualification, ToR submission, signing, conversion and payment
   reconciliation.
3. Enforce permissions on the API. Frontend route guards are not
   security boundaries.
4. Keep money precise. Use a decimal-safe representation and store
   currency explicitly; do not use binary floating-point arithmetic for
   financial calculations.
5. Make asynchronous operations retry-safe. Payment webhooks,
   signature callbacks, recurring invoice generation and client
   conversion must tolerate duplicate delivery.
6. Audit sensitive changes. Record actor, timestamp, entity,
   old/new values and reason where required.
7. Separate drafts from signed records. A signed ToR is a
   historical agreement, not an editable form.
8. Validate at runtime. Shared TypeScript types improve consistency
   but do not validate incoming API data.
9. Keep integrations replaceable. Encapsulate email, SMS, payment
   and document providers behind application-level interfaces.
10. Build Phase 1 as a complete workflow. Demonstrate a lead moving
    through to signed ToR, rather than delivering disconnected CRUD
    pages.
11. Do not silently invent policy. Where the source is incomplete,
    obtain a business decision or record an explicitly approved default.
12. Keep future phases out of the MVP critical path. Design for
    extension, but implement only the agreed phase scope.
14. Definition of done
A feature is not complete merely because its screen exists. At minimum:
- The user can perform the intended workflow for their role.
- The API validates the request and enforces authorization.
- Related records are linked correctly.
- State transitions follow approved business rules.
- Important changes are audited.
- Loading, empty, success and error states are handled in the UI.
- Relevant automated tests cover business rules and failure cases.
- The feature works at supported desktop and mobile sizes.
- Documentation and staging data are updated.
- Acceptance criteria for the relevant phase are demonstrable.
15. Glossary
  Term                                Meaning in this product
  Lead                                A potential customer/opportunity
before becoming a client

  Deal                                The sales opportunity and its
pipeline lifecycle

  Company                             The organization associated with
one or more contacts and deals

  Contact                             A person at a company, such as
owner or finance manager

  BANT                                Budget, Authority, Need and
Timeline qualification framework

  ToR                                 Terms of Reference; the agreed
scope and commercial/delivery
record

  Scope item                          A module, feature or custom line
item included or excluded in a ToR

  Scope alignment                     Iterative process of adding,
removing and agreeing requirements

  Change request                      A request to change an already
signed agreement

  UAT                                 User Acceptance Testing

  MRR                                 Monthly Recurring Revenue from
hosting and support

  SLA                                 Service Level Agreement / agreed
support response and resolution
expectations

  eTIMS                               Kenya Revenue Authority electronic
Tax Invoice Management System
Receivables ageing                  Outstanding invoices grouped by how
long they have been overdue
Appendix A --- Source-to-PRD traceability
This PRD is based on the five-page Autonova Scope of Work dated 6
November 2026.

  Source section                                PRD sections
  1. Purpose and objectives                    1
2. Users and roles                           2
3. Sales pipeline                            3
4.1 Leads                                     4.1
4.2 Contacts and companies                    4.2
4.3 Visit and call reports                    4.3
4.4 Qualification                             4.4
4.5 Terms of Reference                        4.5
4.6 Quotations                                4.6
4.7 Conversion and client accounts            4.7
4.8 Billing and subscriptions                 4.8
4.9 Support tickets                           4.9
4.10 Notifications and tasks                  4.10
5. Key records and fields                    6
6. Reports and dashboard                     5
7. Technical requirements and integrations   7--9
8. Phasing and acceptance                    10--11