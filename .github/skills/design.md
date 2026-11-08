# Autonova CRM — Web Application Design Guidelines

**Document:** `docs/design/webapp.md`  
**Product:** Autonova CRM  
**Status:** Design foundation  
**Audience:** Frontend engineers, designers, product engineers and AI coding agents  
**Applies to:** Next.js web application

---

# 1. Purpose

This document defines the visual language, interaction patterns, navigation, reusable components and user experience principles for the Autonova CRM web application.

It is the frontend design source of truth.

All new screens, components and features must follow these guidelines unless an approved design decision explicitly overrides them.

The objective is to create a professional, intuitive and efficient CRM that supports Autonova's complete sales and client engagement lifecycle.

The application should feel:

- Professional and trustworthy.
- Modern without being visually excessive.
- Information-rich without being cluttered.
- Consistent across modules.
- Fast to navigate.
- Responsive across desktop, tablet and mobile.
- Easy to learn for non-technical business users.

Do not copy another CRM's interface wholesale. Use established products as references for interaction patterns, not as templates to reproduce.

# 2. Product design references

Use the following products as design references.

| Reference   | Patterns to learn from                                     | Application in Autonova                                 |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| HubSpot CRM | Record pages, contact timelines, navigation, dashboards    | Companies, contacts, lead details and reporting         |
| Pipedrive   | Kanban pipelines, deal cards, sales activities             | Lead pipeline and sales workflow                        |
| Odoo CRM    | Connected business records, quotations and sales lifecycle | ToR, quotations, invoicing and client management        |
| Zoho CRM    | Blueprint workflows, required fields and approvals         | Qualification, stage transitions and approval processes |

## 2.1 Design interpretation

**HubSpot:** Prioritize clarity, readable record pages and contextual activity timelines.

**Pipedrive:** Make pipeline progression visible and easy to understand. Cards should expose the most important information without requiring users to open every record.

**Odoo:** Make relationships between business records visible. Users should be able to navigate between a company, its contacts, leads, quotations and invoices.

**Zoho:** Guide users through controlled workflows. Required information, approval states and prohibited transitions should be clearly communicated.

# 3. Visual identity

## 3.1 Brand direction

Use the existing Autonova brand direction:

- Navy: primary brand and navigation.
- Electric blue: primary actions and interactive elements.
- Cyan: supporting highlights and informational states.
- White and neutral surfaces: content backgrounds.
- Subtle grey borders: visual separation.

The interface should have a restrained enterprise aesthetic.

Avoid:

- Excessive gradients.
- Too many accent colors.
- Large decorative illustrations.
- Excessive shadows.
- Oversized cards.
- Unnecessary animation.
- Decorative charts that do not communicate useful information.

## 3.2 Suggested color tokens

These are proposed web application tokens and should be validated against the official Autonova logo and brand assets before final production use.

| Token          | Suggested value | Usage                                |
| -------------- | --------------- | ------------------------------------ |
| Primary navy   | `#142B4A`       | Sidebar, headings and brand elements |
| Primary blue   | `#2563EB`       | Primary buttons and links            |
| Electric blue  | `#3B82F6`       | Interactive emphasis                 |
| Cyan           | `#06B6D4`       | Informational highlights             |
| App background | `#F7F9FC`       | Main application background          |
| Surface        | `#FFFFFF`       | Cards, tables and forms              |
| Border         | `#E2E8F0`       | Dividers and component borders       |
| Primary text   | `#172B4D`       | Main content                         |
| Secondary text | `#64748B`       | Supporting content                   |
| Muted text     | `#94A3B8`       | Metadata and placeholders            |

### Semantic colors

Use semantic colors consistently.

| Meaning     | Suggested color | Usage                         |
| ----------- | --------------- | ----------------------------- |
| Success     | Green           | Completed, paid, approved     |
| Warning     | Amber           | Pending, approaching due date |
| Danger      | Red             | Overdue, rejected, failed     |
| Information | Blue            | Informational messages        |
| Neutral     | Grey            | Draft, inactive, archived     |

Do not communicate status through color alone. Always include text labels or another accessible indicator.

## 3.3 Typography

Use a modern, readable sans-serif font.

Recommended:

- Inter.
- Geist Sans.

Use a consistent typographic hierarchy.

| Element         | Suggested treatment |
| --------------- | ------------------- |
| Page title      | 24–28px, semibold   |
| Section heading | 16–20px, semibold   |
| Card heading    | 14–16px, semibold   |
| Body            | 14px                |
| Supporting text | 12–13px             |
| Table content   | 13–14px             |
| Form labels     | 13–14px, medium     |

Avoid excessive font-size variation.

Use tabular numbers for monetary values, dates and metrics where appropriate.

# 4. Application layout

## 4.1 Main shell

Use a persistent application shell with:

1. Left navigation sidebar.
2. Top header.
3. Main content region.
4. Contextual actions within individual pages.

Suggested desktop structure:

```text
+--------------------------------------------------------------+
| Sidebar       | Top Header                                   |
|               |----------------------------------------------|
| Logo          | Breadcrumbs             Search   Notifications|
|               |----------------------------------------------|
| Dashboard     |                                              |
| Leads         | Page Title                  Primary Action   |
| Companies     | Page Description                            |
| Contacts      |                                              |
| Activities    |----------------------------------------------|
| Pipeline      |                                              |
| Quotations    | Main Content                                 |
| Terms of Ref. |                                              |
| Clients       |                                              |
| Billing       |                                              |
| Support       |                                              |
| Reports       |                                              |
|               |                                              |
| Settings      |                                              |
| User Profile  |                                              |
+--------------------------------------------------------------+
```

## 4.2 Sidebar navigation

Use grouped navigation rather than displaying every route as an unrelated item.

Suggested structure:

**Overview**

- Dashboard

**Sales**

- Leads
- Pipeline
- Companies
- Contacts
- Activities
- Qualification

**Commercial**

- Scope Catalogue
- Terms of Reference
- Quotations

**Clients**

- Client Accounts
- Milestones
- Subscriptions

**Finance**

- Invoices
- Payments

**Service**

- Support Tickets

**Insights**

- Reports

**Administration**

- Users
- Roles and Permissions
- Settings
- Audit Logs

Navigation visibility must reflect the user's permissions.

A hidden navigation item is not a substitute for backend authorization.

### Sidebar behavior

- Support collapsed and expanded states on desktop.
- Display tooltips when collapsed.
- Clearly indicate the active route.
- Keep the current navigation group visually identifiable.
- On mobile, use a drawer or compact navigation pattern.
- Do not allow the sidebar to consume excessive content width.

## 4.3 Top header

The header should provide:

- Breadcrumb navigation.
- Global search entry point.
- Notifications.
- User profile menu.
- Optional contextual actions.

Avoid putting too many controls in the header.

Use contextual actions inside the relevant page rather than filling the global header with module-specific buttons.

# 5. Page design patterns

## 5.1 Dashboard

The dashboard should provide a useful summary of the business rather than simply displaying decorative charts.

Suggested sections:

**Sales overview**

- Total active leads.
- Pipeline value.
- Weighted pipeline value.
- Qualified leads.
- Conversion rate.

**Activity overview**

- Upcoming follow-ups.
- Overdue follow-ups.
- Recent visits and calls.
- Tasks awaiting completion.

**Commercial overview**

- ToRs awaiting approval.
- ToRs awaiting signatures.
- Signed setup fees.
- Quotations awaiting response.

**Finance overview**

- Total invoiced.
- Total collected.
- Outstanding receivables.
- Monthly recurring revenue, when subscriptions are implemented.

**Service overview**

- Open tickets.
- High-priority tickets.
- Overdue tickets.

### Dashboard design rules

- Make the most important metrics visible immediately.
- Use metric cards sparingly.
- Include comparison periods only when the underlying data supports them.
- Make charts interactive where useful.
- Allow users to navigate from a metric to its underlying records.
- Respect role-based data visibility.
- Avoid displaying metrics a user is not authorized to access.

The Director dashboard may provide an organization-wide overview, while Business Development users should primarily see their assigned pipeline and activities.

## 5.2 List and table pages

Use consistent list-page layouts for leads, companies, contacts, invoices and tickets.

Standard structure:

```text
Page title
Page description

[Search] [Filters] [View options] [Create]

----------------------------------------------------
| Record | Status | Owner | Updated | Actions      |
----------------------------------------------------
| ...                                             |
----------------------------------------------------

Pagination
```

### Table requirements

- Search.
- Filters.
- Sorting.
- Pagination.
- Column visibility where useful.
- Empty states.
- Loading states.
- Error states.
- Row-level actions.
- Bulk actions only when appropriate.
- Export where supported by permissions.

Use server-side pagination, filtering and sorting for datasets that can grow significantly.

Avoid loading all records into the browser.

Do not make every table cell interactive. Use a clear primary record link.

### Row actions

Prefer a small actions menu for secondary operations.

Keep primary actions visible when they are frequently used.

Examples:

- View.
- Edit.
- Assign.
- Archive.
- Delete, only when authorized and safe.

Destructive operations must have clear confirmation and must explain their consequences.

## 5.3 Record detail pages

Use a consistent record detail layout.

Recommended structure:

**Header**

- Record name.
- Status.
- Owner.
- Primary actions.
- Secondary actions.

**Main content**

- Key information.
- Related information.
- Activity history.
- Documents.
- Notes.

**Contextual sidebar**

- Important dates.
- Ownership.
- Related records.
- Next action.

For leads, use a visible activity timeline.

For companies, show related contacts and opportunities.

For clients, show ToRs, milestones, invoices, payments and support tickets.

Use tabs only when they help organize substantial content. Avoid unnecessary tabs for small amounts of information.

# 6. Core feature design guidelines

## 6.1 Lead management

Reference: Pipedrive + HubSpot + Odoo.

### Lead list

Display:

- Lead name.
- Company.
- Contact.
- Owner.
- Source.
- Pipeline stage.
- Qualification status.
- Estimated value, when known.
- Next action.
- Follow-up date.

Provide filters for:

- Owner.
- Stage.
- Source.
- Qualification status.
- Follow-up date.
- Creation date.

### Lead creation

Use a concise initial form.

Required fields should be limited to the information needed to create a valid lead.

Additional information can be completed later.

Suggested fields:

- Lead or opportunity name.
- Company.
- Primary contact.
- Phone.
- Email.
- Lead source.
- Product or service interest.
- Assigned owner.
- Initial notes.
- Next action and date.

Check for potential duplicates using relevant company and contact identifiers.

Do not silently merge records.

### Lead detail

Use a structured layout with:

- Lead overview.
- Pipeline stage.
- Qualification.
- Company and contact details.
- Activity timeline.
- Notes.
- Documents.
- Next follow-up.

Keep the next required action visible.

## 6.2 Pipeline

Reference: Pipedrive.

Use a Kanban-style pipeline for visual sales progression.

Initial stages:

1. New Lead.
2. Visits and Calls.
3. Qualified.
4. Scope Alignment.
5. ToR and Quote Sent.
6. Won.
7. Lost.

Each card should show:

- Lead name.
- Company.
- Owner.
- Estimated value.
- Next activity.
- Follow-up date.
- Qualification status.

### Pipeline interactions

- Drag-and-drop may be supported for permitted transitions.
- Every stage change must be validated by the backend.
- Invalid transitions must be rejected.
- Required information must be completed before advancing.
- The UI must explain why a transition is blocked.
- Important stage changes should be audited.

Do not use drag-and-drop as the only way to change a stage. Provide an accessible alternative through a menu or action.

### Important business distinction

Won is a sales outcome, but it must not automatically create a client account unless the required ToR signatures have been verified.

## 6.3 Companies and contacts

Reference: HubSpot.

Company pages should present:

- Company profile.
- KRA PIN.
- Location.
- Industry.
- Company size.
- Related contacts.
- Associated leads.
- Commercial history.
- Activity timeline.

Contact pages should present:

- Name.
- Position.
- Phone.
- Email.
- Associated company.
- Related leads.
- Activity history.

Support multiple contacts per company and multiple opportunities associated with a company.

Avoid duplicating company information inside every contact or lead record.

## 6.4 Activities and visits

Reference: HubSpot activity timelines and Odoo sales activities.

Support:

- Calls.
- Meetings.
- Site visits.
- Emails.
- Notes.
- Follow-up tasks.

An activity should capture relevant details such as:

- Activity type.
- Date and time.
- Participants.
- Location where applicable.
- Discussion.
- Pain points.
- Identified needs.
- Tools or systems currently used.
- Agreed next steps.
- Attachments.

### Activity timeline

Present activities chronologically.

Make it easy to identify:

- Who performed the activity.
- What happened.
- When it happened.
- What the next action is.

Do not confuse activity history with current record data.

## 6.5 Qualification

Reference: Zoho CRM.

Use a structured qualification interface based on BANT:

- Budget.
- Authority.
- Need.
- Timeline.

Show:

- Individual scores.
- Overall score.
- Qualification result.
- Missing information.
- Reviewer or override information.

### Interaction rules

- Clearly communicate the qualification threshold.
- Display why a lead passed or failed.
- Require a reason for an authorized override.
- Preserve the qualification history.
- Do not allow users to manipulate the score directly through the frontend.

## 6.6 Terms of Reference

This is a distinctive and important Autonova feature.

Do not treat the ToR builder as an ordinary text form.

Design it as a structured document workflow.

Suggested layout:

**Step 1 — Project information**

- Client.
- Project name.
- Description.
- Prepared by.

**Step 2 — Scope**

- Deliverables.
- Scope items.
- Inclusions.
- Exclusions.
- Estimates.
- Milestones.

**Step 3 — Commercials**

- Setup fee.
- Recurring fees.
- Hosting.
- Support.
- Discounts.
- Currency.
- VAT treatment.
- Payment terms.

**Step 4 — Review**

- Scope summary.
- Financial summary.
- Approval status.
- Validation errors.

**Step 5 — Document**

- PDF preview.
- Version.
- Send for signature.
- Signature status.

### ToR design requirements

- Clearly display the current version.
- Preserve previous versions.
- Show approval and signing states.
- Distinguish draft, review, approved, sent, partially signed and fully signed.
- Display who needs to sign.
- Prevent edits to signed contractual versions.
- Provide a change-request workflow for modifications.

Use a document preview that resembles the generated PDF.

Avoid presenting the user with one enormous form.

## 6.7 Quotations

Reference: Odoo.

Quotation pages should display:

- Quotation number.
- Client or lead.
- Related ToR where applicable.
- Currency.
- Amount.
- Validity date.
- Status.
- Creation date.

Provide:

- Create.
- Edit draft.
- Preview.
- Generate PDF.
- Send.
- Track acceptance.
- Track rejection.
- Expiry handling.

Maintain a clear relationship between a quotation and its underlying commercial scope.

## 6.8 Client accounts

A client account should be a connected overview of the signed business relationship.

Show:

- Company information.
- Signed ToRs.
- Project milestones.
- Subscriptions.
- Invoices.
- Payments.
- Support tickets.
- Account activity.

The client conversion action must only be available after the required ToR signatures have been verified by the backend.

## 6.9 Billing and payments

Use a clean financial interface.

Display:

- Invoice number.
- Client.
- Invoice date.
- Due date.
- Currency.
- Total amount.
- Amount paid.
- Outstanding balance.
- Payment status.

Use clear states:

- Draft.
- Issued.
- Partially Paid.
- Paid.
- Overdue.
- Cancelled.

Payment history should be visible from the invoice detail page.

Never imply that an invoice is fully paid when only a partial payment has been recorded.

## 6.10 Support tickets

Reference: HubSpot service workflows.

Ticket list should display:

- Ticket number.
- Subject.
- Client.
- Priority.
- Status.
- Assignee.
- Created date.
- SLA status.

Ticket detail should contain:

- Description.
- Conversation history.
- Attachments.
- Assignment.
- Priority.
- Status history.
- Time spent.
- SLA information.

Make ticket status and priority easy to scan.

# 7. Reusable component system

Build a consistent component library rather than designing every module independently.

Use existing UI primitives where practical. Avoid creating custom components for patterns already solved by the chosen UI library.

Recommended component categories:

## 7.1 Layout

- AppShell.
- Sidebar.
- Topbar.
- PageHeader.
- PageContainer.
- ContentSection.
- DetailLayout.
- ResponsiveDrawer.

## 7.2 Data display

- DataTable.
- DataTableToolbar.
- Pagination.
- MetricCard.
- StatusBadge.
- Avatar.
- ActivityTimeline.
- EmptyState.
- Skeleton.
- RecordSummary.

## 7.3 Forms

- FormField.
- TextInput.
- Textarea.
- Select.
- Combobox.
- DatePicker.
- CurrencyInput.
- PhoneInput.
- FileUploader.
- FormSection.
- FormActions.

## 7.4 Actions

- Button.
- DropdownMenu.
- ConfirmationDialog.
- AlertDialog.
- Modal.
- Drawer.
- Tooltip.
- Toast.
- CommandSearch.

## 7.5 CRM-specific components

- LeadCard.
- PipelineBoard.
- PipelineColumn.
- ActivityItem.
- QualificationScore.
- ApprovalStatus.
- SignatureStatus.
- DocumentPreview.
- InvoiceSummary.
- PaymentHistory.
- TicketPriority.

Components must be reusable without becoming excessively configurable.

Prefer clear, composable APIs.

# 8. Forms and interaction patterns

## 8.1 Form design

- Use clear labels.
- Group related fields.
- Show required fields.
- Explain unusual requirements.
- Validate at appropriate points.
- Preserve user input when validation fails.
- Display errors near the relevant field.
- Avoid unnecessarily long forms.

Use progressive disclosure when a form contains optional or advanced information.

## 8.2 Save behavior

Use explicit Save or Submit actions for important business records.

For suitable low-risk drafts, autosave may be considered.

Never use autosave in a way that silently modifies signed or approved contractual data.

Display clear saving, saved and failed states.

## 8.3 Confirmation dialogs

Use confirmation dialogs for actions with meaningful consequences.

Examples:

- Delete a record.
- Archive a record.
- Reject a quotation.
- Cancel an invoice.
- Approve a discount.
- Submit a ToR for signature.

Do not ask for confirmation for every ordinary navigation or minor edit.

## 8.4 Feedback

Every important user action should provide feedback.

Examples:

- Lead created successfully.
- Follow-up updated.
- Qualification submitted.
- Approval requested.
- PDF generated.
- Invoice payment recorded.

Use toasts for short confirmations and inline messages for persistent errors or warnings.

# 9. Responsive design

Design desktop-first because CRM users frequently work with tables, dashboards and detailed records.

However, mobile support is essential for Business Development users who may be recording calls, visits and follow-ups away from a desk.

## Desktop

- Full sidebar.
- Multi-column layouts where useful.
- Full data tables.
- Detailed record views.
- Pipeline Kanban.

## Tablet

- Collapsible sidebar.
- Reduced column count.
- Responsive forms.
- Scrollable tables where necessary.

## Mobile

Prioritize:

- Dashboard summary.
- Lead lookup.
- Lead creation.
- Contact details.
- Visit and call reporting.
- Follow-up management.
- Basic pipeline actions.

Use:

- Compact cards instead of dense tables where appropriate.
- Drawer navigation.
- Stacked form fields.
- Touch-friendly controls.
- Clear primary actions.

Do not simply shrink desktop layouts to fit mobile screens.

# 10. Accessibility

Follow WCAG 2.2 AA as the accessibility target.

Requirements:

- Semantic HTML.
- Keyboard navigation.
- Visible focus states.
- Accessible form labels.
- Appropriate contrast.
- Accessible dialog behavior.
- Screen-reader-friendly status messages.
- Text alternatives for meaningful icons.
- Non-color indicators for status.
- Accessible drag-and-drop alternatives.

Use icons alongside text for important actions where ambiguity could occur.

# 11. Loading, empty, error and success states

Every data-driven screen must consider all four states.

**Loading**

- Use skeletons for major content areas.
- Avoid unnecessary full-page loading indicators.
- Prevent duplicate submissions where necessary.

**Empty**

- Explain why no data is displayed.
- Provide an appropriate next action.
- Do not show empty charts without context.

**Error**

- Display understandable messages.
- Preserve user input where possible.
- Provide retry actions where appropriate.
- Do not expose internal stack traces.

**Success**

- Confirm the completed action.
- Update relevant data.
- Avoid requiring a manual page refresh.

# 12. Frontend architecture conventions

Use feature-oriented organization.

Suggested structure:

```text
apps/web/src/
├── app/
│   ├── (auth)/
│   └── (dashboard)/
├── components/
│   ├── layout/
│   ├── ui/
│   └── shared/
├── features/
│   ├── auth/
│   ├── users/
│   ├── companies/
│   ├── contacts/
│   ├── leads/
│   ├── activities/
│   ├── qualification/
│   ├── pipeline/
│   ├── terms-of-reference/
│   ├── quotations/
│   ├── clients/
│   ├── billing/
│   ├── support/
│   └── reports/
├── lib/
├── hooks/
├── services/
├── config/
└── types/
```

Each feature should own its relevant:

- Components.
- Hooks.
- API functions.
- Schemas.
- Types.
- Tests.

Do not place all application components in a single shared folder.

Do not create a global abstraction for something used in only one feature without a clear reason.

## 12.1 State management

Separate:

- Server state.
- Form state.
- Local UI state.
- Authentication/session state.

Use a consistent server-state strategy.

Avoid duplicating API data unnecessarily in multiple state stores.

Do not use global state for data that can be fetched and cached appropriately.

## 12.2 API interaction

- Centralize API client configuration.
- Handle authentication consistently.
- Normalize error handling.
- Use shared contracts where appropriate.
- Validate important external data.
- Avoid API calls directly inside large UI components.
- Keep business logic out of presentation components.

# 13. Performance guidelines

- Use server-side pagination for large datasets.
- Avoid unnecessary client-side rendering.
- Use server components where appropriate.
- Keep client components focused on interactive behavior.
- Lazy-load expensive features.
- Optimize images and documents.
- Avoid unnecessary dependencies.
- Prevent repeated API calls.
- Use appropriate caching and invalidation.
- Avoid N+1 request patterns.
- Monitor real performance before introducing complex optimizations.

# 14. Security and permission-aware UI

The frontend must reflect the user's permissions.

Examples:

- Finance should not see controls for editing signed project scope.
- Business Development should not see unauthorized administrative controls.
- Approval actions should only appear for authorized users.
- Destructive operations should be restricted.

However, frontend permission checks are only for user experience.

The API must independently enforce all authorization rules.

Never trust a role or permission supplied by the browser.

# 15. Design consistency rules

1. Use the same spacing system across all modules.
2. Use consistent page headers.
3. Reuse established table patterns.
4. Use consistent status labels.
5. Keep primary actions in predictable positions.
6. Avoid unnecessary modals.
7. Use drawers for contextual record creation or inspection when appropriate.
8. Prefer inline editing for small, low-risk changes.
9. Use full-page forms or structured steps for complex workflows.
10. Keep financial information clearly formatted.
11. Never hide important business errors.
12. Avoid overloading dashboards.
13. Keep empty states helpful.
14. Make record relationships easy to navigate.
15. Ensure responsive behavior is designed, not improvised.

# 16. Design acceptance checklist

Before a new screen is considered complete, verify:

## Visual consistency

- [ ] Uses approved color tokens.
- [ ] Uses established typography.
- [ ] Follows spacing conventions.
- [ ] Uses standard components.
- [ ] Has a clear visual hierarchy.

## Usability

- [ ] Has a clear page title.
- [ ] Has predictable primary actions.
- [ ] Has understandable forms.
- [ ] Has useful empty states.
- [ ] Has clear loading and error states.
- [ ] Provides feedback after actions.

## Responsiveness

- [ ] Works on desktop.
- [ ] Works on tablet.
- [ ] Works on mobile where the workflow requires it.
- [ ] Tables and forms remain usable on smaller screens.

## Accessibility

- [ ] Keyboard accessible.
- [ ] Visible focus states.
- [ ] Proper form labels.
- [ ] Appropriate contrast.
- [ ] Status is not conveyed by color alone.

## Engineering

- [ ] Uses feature-oriented structure.
- [ ] Reuses existing components.
- [ ] Has typed API interactions.
- [ ] Handles server errors.
- [ ] Respects permissions.
- [ ] Does not duplicate business logic.

# 17. Instructions for AI coding agents

Before implementing or modifying any frontend feature:

1. Read this document.
2. Read the relevant flow specification.
3. Inspect existing frontend conventions and components.
4. Identify reusable components.
5. Understand the API contract.
6. Confirm permissions and user roles.
7. Implement the complete relevant UI states.
8. Verify responsive behavior.
9. Run type checks, linting and relevant tests.
10. Update documentation if the design pattern or implementation changes.

Do not:

- Invent new design systems for individual pages.
- Change established colors or typography without justification.
- Introduce a second component library without approval.
- Duplicate shared components.
- Create generic abstractions that make simple components difficult to understand.
- Hardcode mock data into production screens.
- Simulate successful backend operations.
- Hide backend authorization failures.
- Change business rules to make a frontend interaction easier.

If a new design pattern is required, propose it, explain why existing components are insufficient and document the decision.

---

# 18. Final design principle

Autonova CRM should make complex business processes feel simple.

Users should always understand:

- Where they are.
- Which record they are working on.
- What has happened.
- What they are allowed to do.
- What needs approval.
- What action comes next.
- Whether their action succeeded.

**Design for clarity, consistency, business correctness and speed of execution.**
