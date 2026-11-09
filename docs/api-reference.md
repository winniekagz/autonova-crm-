# Autonova CRM API reference

**Current API snapshot:** `0.0.0` · **Base path:** `/api/v1` · **Format:** JSON

This reference describes endpoints available in the current code. Director MFA and the first persisted
lead workflow, companies and contacts, and visit and call reports are implemented. Qualification, quotations, ToRs, signature, client
conversion, billing, and support remain future work. The interactive Swagger page and OpenAPI JSON
are generated from the API code.

## Open the interactive API docs

Start the local stack from the repository root:

```bash
docker compose --profile app up -d --build
```

Then open:

- Swagger UI: <http://localhost:4000/api/docs>
- OpenAPI JSON: <http://localhost:4000/api/docs-json>
- Web app: <http://localhost:3000>
- Local email inbox (Mailpit): <http://localhost:8025>
- API readiness (includes database): <http://localhost:4000/api/v1/health>

Swagger is enabled by default in the local Compose stack. In the production deployment's API
environment, set `SWAGGER_ENABLED=false` unless the API reference is intentionally available there. The `localhost`
links work only on the developer's machine. To share with stakeholders, publish the JSON file from
a review/staging environment or attach an exported copy; do not send local credentials or tokens.
To save the local OpenAPI document for review, run `curl -fsS http://localhost:4000/api/docs-json -o autonova-openapi.json` from a machine with the local stack running. The generated JSON contains the API contract, not access tokens.

### Try an authenticated request

1. In Swagger, expand `POST /api/v1/auth/login` and sign in with a provisioned account.
2. Copy the `accessToken` from the response.
3. Select **Authorize**, enter the token as a Bearer token, and authorize.
4. A Director must complete MFA in the web app before using protected API operations. In Swagger,
   authorize with the returned access token and try endpoints allowed by that account's permissions.
   To test refresh in local Swagger, sign in through the Swagger page first so the browser stores the HttpOnly cookie; Swagger adds the CSRF header automatically. The Swagger origin must be listed in `CORS_ORIGINS`.

Tokens are credentials. Do not paste them into tickets, stakeholder documents, or screenshots. The
login endpoint is limited to 10 attempts per minute per client address; the API-wide limit is 300
requests per minute per client address.

## Test the API from Swagger

Run these checks against the local demo or an isolated staging environment. In Swagger, use
**Authorize** for the access token. To test `/auth/refresh`, sign in through Swagger first so the
browser stores its HttpOnly cookie. Swagger supplies the CSRF header; if you get `CSRF_REJECTED`,
add the Swagger origin (usually `http://localhost:4000`) to `CORS_ORIGINS` and recreate the API container.

### 1. Check service and database

Call `GET /api/v1/health/live` (process check) and `GET /api/v1/health` (database readiness). Both
are public. The readiness response should report an overall healthy status and a healthy database
indicator.

### 2. Sign in and inspect permissions

Call `POST /api/v1/auth/login` with a provisioned account, then copy `accessToken` from the response
into **Authorize**. Call `GET /api/v1/auth/me`; use its `roles`, `permissions`, `mfa`, and `restricted`
fields to understand which protected requests this account can make. User and lead routes return
`403 FORBIDDEN` when the account lacks their listed permission.

### 3. Enroll Director TOTP (first-time setup)

Keep the same login token authorized; the following MFA routes allow a restricted Director session.

1. Call `GET /api/v1/auth/mfa/status`. For a Director who has not enrolled, expect `{ "enrolled": false }`.
2. Call `POST /api/v1/auth/mfa/enrollment` with no body. The response contains `secret` and `uri`.
   Enter the secret into an authenticator app manually, or use the Autonova web app's QR setup. The
   secret/URI can enroll an account, so do not share or capture it.
3. Read the current six-digit code from the authenticator and call
   `POST /api/v1/auth/mfa/enrollment/confirm` with:

   ```json
   { "code": "123456" }
   ```

   Replace `123456` with the live code. The response contains ten recovery codes once. Store them
   securely before closing the response; the API cannot show them again.

4. Call `GET /api/v1/auth/me`. The current session should now report `mfa.required: true`,
   `mfa.verified: true`, and `restricted: false`. `GET /api/v1/auth/mfa/status` should return
   `{ "enrolled": true }`.

### 4. Test TOTP on a later login

1. Call `POST /api/v1/auth/login` again and replace the token in **Authorize** with this new
   `accessToken`.
2. `GET /api/v1/auth/me` should show `restricted: true` until this new session verifies MFA.
3. Call `POST /api/v1/auth/mfa/verify` with the current authenticator code using the same JSON shape
   above. It returns HTTP `201` with an empty response body; `/auth/me` should then show
   `restricted: false`.

TOTP codes rotate on a short time interval and each accepted code step is single-use. If a code has
already been submitted, wait for a fresh code. Invalid attempts are rate limited; five failures can
lock MFA for 15 minutes. Avoid repeatedly trying sample codes.

### 5. Test recovery only with a disposable Director

Call `POST /api/v1/auth/mfa/recover` with one saved code:

```json
{ "code": "0123-4567-89AB-CDEF-0123-4567-89AB-CDEF" }
```

Use a real unused code from the enrollment response. Recovery is one-time, clears MFA enrollment,
and restricts every session for that Director. The current session does not become verified. Call
the enrollment and confirmation routes again to set up TOTP. Do not use this step on a stakeholder or
production account.

### 6. Exercise lead endpoints

With an account whose `/auth/me` response includes lead permissions, create a lead using
`POST /api/v1/leads`:

```json
{
  "name": "Northstar Clinic Website",
  "companyName": "Northstar Clinic",
  "email": "contact@example.test",
  "source": "REFERRAL",
  "referrerName": "Jane Mwangi",
  "productInterest": "RETAIL_POS",
  "estimatedValue": "12500.50",
  "currency": "KES",
  "nextAction": "Schedule discovery call",
  "nextActionAt": "2026-11-10T08:00:00.000Z",
  "probability": 20
}
```

Use a unique email for repeat runs. `referrerName` is required for `REFERRAL`; switch `source` to
another documented enum to omit it. Copy the returned lead `id`, then call `GET /api/v1/leads` (try
`page`, `pageSize`, and `q`), `GET /api/v1/leads/{id}`, and `PATCH /api/v1/leads/{id}` with a small
body such as `{ "nextAction": "Send proposal outline" }`. BD users only see and update their own
leads; Directors can see all leads. Owner and stage changes are not supported through this generic
PATCH route. Use the dedicated lifecycle routes below for permitted forward transitions and outcomes.

The server returns `lifecycle.transitions`, `lifecycle.canDisqualify`, and `lifecycle.canMarkLost` on
lead DTOs. Advance with `POST /api/v1/leads/{id}/transitions` (`toStage`, and a `reason` when moving
to `QUALIFIED`); disqualify with `POST /api/v1/leads/{id}/disqualification` (`reason` and
`revisitOn` only for `TIMING_REVISIT_LATER`); mark Lost with `POST /api/v1/leads/{id}/lost`
(`reason`); inspect history with `GET /api/v1/leads/{id}/history`. A one-shot revisit processor is
available as `pnpm --filter @autonova/api leads:process-revisits`; deployment must schedule it
recurringly. Revisit dates use the Africa/Nairobi calendar day.

`productInterest` must be one of `RETAIL_POS`, `CAR_WASH_AUTOMATION`, `ERP`, `VISITOR_SECURITY_SYSTEM`,
`HIRING_PLATFORM`, `CUSTOM_BUILD` (or `null`/omitted). Before saving, `POST /api/v1/leads/duplicate-check`
(`phone`, `companyName`, optional `excludeLeadId`) lists possible duplicates the caller may read. A
create or update that matches an existing lead's normalised phone or company returns
`409 LEAD_DUPLICATE_SUSPECTED` until the request is resent with `"acknowledgeDuplicates": true`.
`GET /api/v1/leads/{id}/reminders` returns the next-action reminder delivery records; the emails
are sent by the scheduled `pnpm --filter @autonova/api leads:send-reminders` worker.

### 7. Exercise users, roles, sessions, and logout

- Call `GET /api/v1/roles` and `GET /api/v1/users` to inspect assignable roles and paginated users.
- With the required permissions, call `POST /api/v1/users` using `email`, `fullName`, and a non-empty
  `roles` array. This creates an `INVITED` account and sends its owner a 48-hour setup link. Open
  Mailpit at <http://localhost:8025> in local Compose, follow the message link, set a password, then
  sign in. Use `GET /api/v1/users/{id}` and `PATCH /api/v1/users/{id}` to inspect and rename the
  record.
- `POST /api/v1/users/{id}/invitation` sends a fresh link and revokes previous links. It is useful
  after an email configuration failure or an expired invitation.
- To exercise acceptance directly in Swagger, copy the token from the email URL fragment (the part
  after `#token=`) and call `POST /api/v1/auth/invitations/accept` with `{ "token": "…", "password": "…" }`.
  Tokens are single-use and expire after 48 hours. Passwords follow the shared 12–128 character
  policy. The web form reads the fragment locally, removes it from the address bar, and sends the
  token only in the HTTPS request body.
- `PUT /api/v1/users/{id}/roles` replaces the target user's role list. You cannot change your own
  roles. `POST /api/v1/users/{id}/disable` revokes that user's sessions; test this only on a
  disposable account and do not disable the last active Director.
- `GET /api/v1/auth/sessions` lists your sessions. `DELETE /api/v1/auth/sessions/{sessionId}` revokes
  one; avoid revoking the current session if you still need to run more Swagger calls.
- Finish with `POST /api/v1/auth/logout`; expect HTTP `204`. The access token is no longer usable.

Refresh uses the HttpOnly cookie, allowed `Origin`, and `X-Autonova-CSRF: 1`; use the web app to
exercise that browser-only flow. Every endpoint and its required permission is listed below and in
the Swagger operation itself.

## Endpoints available now

| Method  | Endpoint                              | Access                           | Purpose                                                                     |
| ------- | ------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `GET`   | `/api/v1/health/live`                 | Public                           | Confirms the API process is running.                                        |
| `GET`   | `/api/v1/health`                      | Public                           | Readiness check; confirms PostgreSQL is reachable.                          |
| `POST`  | `/api/v1/auth/login`                  | Public                           | Sign in with email and password; returns an access token.                   |
| `GET`   | `/api/v1/auth/mfa/status`             | Bearer; Director                 | Reports whether TOTP enrollment is complete.                                |
| `POST`  | `/api/v1/auth/mfa/enrollment`         | Restricted Director              | Starts enrollment; returns a provisioning URI and manual setup key.         |
| `POST`  | `/api/v1/auth/mfa/enrollment/confirm` | Restricted Director              | Confirms TOTP and returns recovery codes once.                              |
| `POST`  | `/api/v1/auth/mfa/verify`             | Restricted Director              | Verifies TOTP for the current session.                                      |
| `POST`  | `/api/v1/auth/mfa/recover`            | Restricted Director              | Consumes a recovery code and requires enrollment again.                     |
| `GET`   | `/api/v1/auth/me`                     | Bearer token                     | Returns the current account's roles, permissions, and MFA state.            |
| `POST`  | `/api/v1/auth/logout`                 | Bearer token                     | Revokes the current session; returns `204`.                                 |
| `GET`   | `/api/v1/users`                       | `users:list`                     | Lists users with pagination and optional `q`, `status`, and `role` filters. |
| `POST`  | `/api/v1/users`                       | `users:create`                   | Creates an invited user and sends the account setup email.                  |
| `POST`  | `/api/v1/users/{id}/invitation`       | `users:create`                   | Resends a fresh one-time account setup link.                                |
| `POST`  | `/api/v1/auth/invitations/accept`     | Public, one-time link            | Sets the initial password and activates the invited account.                |
| `GET`   | `/api/v1/users/{id}`                  | `users:read`                     | Reads one safe user record by UUID.                                         |
| `PATCH` | `/api/v1/users/{id}`                  | `users:update`                   | Changes a user's display name.                                              |
| `PUT`   | `/api/v1/users/{id}/roles`            | `users:assign_roles`             | Replaces the target user's roles; you cannot change your own roles.         |
| `POST`  | `/api/v1/users/{id}/disable`          | `users:disable`                  | Disables a user and revokes their sessions.                                 |
| `GET`   | `/api/v1/roles`                       | `roles:list`                     | Lists assignable system roles.                                              |
| `GET`   | `/api/v1/leads`                       | `leads:list`                     | Lists leads in the caller's permitted scope with pagination/search.         |
| `POST`  | `/api/v1/leads`                       | `leads:create`                   | Creates a caller-owned lead in `NEW_LEAD`.                                  |
| `POST`  | `/api/v1/leads/duplicate-check`       | `leads:create`                   | Lists readable possible duplicates by phone, plus a hidden count.           |
| `PATCH` | `/api/v1/leads/{id}/relationships`    | `leads:update`, `companies:read` | Links a lead to a company, primary contact and additional contacts.         |
| `GET`   | `/api/v1/leads/{id}`                  | `leads:read`                     | Reads a lead within the caller's permitted scope.                           |
| `GET`   | `/api/v1/leads/{id}/reminders`        | `leads:read`                     | Returns paginated next-action reminder delivery records.                    |
| `PATCH` | `/api/v1/leads/{id}`                  | `leads:update`                   | Updates lead details and follow-up; stage/owner cannot be changed.          |
| `GET`   | `/api/v1/leads/{id}/history`          | `leads:read`                     | Returns paginated stage history, including scheduled revisit events.        |
| `POST`  | `/api/v1/leads/{id}/transitions`      | `leads:update`                   | Advances the lead through an allowed forward transition.                    |
| `POST`  | `/api/v1/leads/{id}/disqualification` | `leads:update`                   | Disqualifies a lead with a reason and optional revisit date.                |
| `POST`  | `/api/v1/leads/{id}/lost`             | `leads:update`                   | Marks a ToR/quote-stage lead Lost with a required reason.                   |

| `GET` | `/api/v1/companies` | `companies:list` | Lists/searches companies in the caller's scope (`q`, `industry`, `includeArchived`, pagination). |
| `POST` | `/api/v1/companies` | `companies:create` | Creates a company; KRA PIN match refused, name match needs `acknowledgeDuplicates`. |
| `POST` | `/api/v1/companies/duplicate-check` | `companies:create` | Returns `exact` (KRA PIN), `potential` (name) and a hidden count. |
| `GET` | `/api/v1/companies/{id}` | `companies:read` | Reads a company with active-contact and visible-lead counts. |
| `PATCH` | `/api/v1/companies/{id}` | `companies:update` | Updates a company; duplicate rules apply only to a changed name or PIN. |
| `POST` | `/api/v1/companies/{id}/archive` | `companies:archive` | Archives a company with no open leads; releases its KRA PIN. |
| `POST` | `/api/v1/companies/{id}/restore` | `companies:archive` | Restores an archived company if its KRA PIN is still free. |
| `GET` | `/api/v1/companies/{id}/leads` | `companies:read`, `leads:list` | Paginated leads of the company (Directors all, others their own). |
| `GET` | `/api/v1/companies/{companyId}/contacts` | `companies:read` | Paginated contacts, decision-makers first. |
| `POST` | `/api/v1/companies/{companyId}/contacts` | `companies:create` | Adds a contact to a visible, non-archived company. |
| `GET` | `/api/v1/contacts/{id}` | `companies:read` | Reads a contact whose company the caller may see. |
| `PATCH` | `/api/v1/contacts/{id}` | `companies:update` | Updates a contact; its company cannot change. |
| `POST` | `/api/v1/contacts/{id}/archive` | `companies:archive` | Archives a contact that no lead uses. |
| `POST` | `/api/v1/contacts/{id}/restore` | `companies:archive` | Restores an archived contact. |

| `GET` | `/api/v1/leads/{leadId}/activities` | `activities:list` | Paginated reports of a visible lead, newest first (`page`, `pageSize`, `type`). |
| `POST` | `/api/v1/leads/{leadId}/activities` | `activities:create` | Records a visit, call, demo or meeting; never changes the lead's stage. |
| `GET` | `/api/v1/leads/{leadId}/activities/{id}` | `activities:read` | Reads one report of that lead. |
| `PATCH` | `/api/v1/leads/{leadId}/activities/{id}` | `activities:update` | Edits a report (its creator or a Director). The audit records the changed fields. |
| `POST` | `/api/v1/leads/{leadId}/activities/{id}/archive` | `activities:archive` | Archives a report. **Director only; body `{ "reason" }` required.** Nothing is deleted. |
| `POST` | `/api/v1/leads/{leadId}/activities/{id}/restore` | `activities:archive` | Restores an archived report (Director only). |
| `POST` | `/api/v1/leads/{leadId}/activities/{id}/attendees/{attendeeId}/link` | `activities:update` | Links an outside attendee to a contact of the lead's company (body `{ "contactId" }`); creator or Director. Never creates a contact. |
| `POST` | `/api/v1/leads/{leadId}/activities/{id}/hold` | `activities:retention` | Places a legal hold or approved retention exception (body `{ "reference", "reason" }`; Director only). |
| `DELETE`| `/api/v1/leads/{leadId}/activities/{id}/hold` | `activities:retention` | Lifts the hold (body `{ "reason" }`; Director only). |
| `GET` | `/api/v1/leads/{leadId}/activities/{id}/attachments` | `activities:read` | Lists a report's active attachments. |
| `POST` | `/api/v1/leads/{leadId}/activities/{id}/attachments` | `activities:update` | Uploads one photo, voice note or document (`multipart/form-data`: `category`, `file`, and `recordingNoticeGiven=true` for a voice note). |
| `GET` | `/api/v1/leads/{leadId}/activities/{id}/attachments/{attachmentId}` | `activities:read` | Downloads an attachment as a file; never inline. |
| `DELETE`| `/api/v1/leads/{leadId}/activities/{id}/attachments/{attachmentId}` | `activities:archive` | Archives an attachment. **Director only; body `{ "reason" }` required.** The stored file is purged later only by the reviewed retention process. |

Reports are always reached through their lead: a wrong, unknown or invisible lead or report id answers
`404`. `occurredAt` is when the interaction happened (an instant, entered on Nairobi's clock) and may be
in the past but not in the future; `createdAt` and `updatedAt` are separate. `gps` is optional and only
accepted on `VISIT`. Attendees are `{ "contactId": "..." }` (a contact of the lead's company) or
`{ "name": "...", "organisation": "..." }`. Upload limits (configurable): photos 10 MB (JPEG, PNG, WebP), documents 25 MB (PDF, DOCX, XLSX, CSV), voice notes
20 MB (MP3, M4A, WAV, WebM), 50 MB and 20 files per report; content is checked, and files are **not** virus-scanned.
A voice note must carry `recordingNoticeGiven=true`. New error codes: `ACTIVITY_DIRECTOR_ONLY`,
`ATTENDEE_NOT_EXTERNAL`, `ACTIVITY_HOLD_EXISTS`, `ACTIVITY_NOT_HELD`, `RECORDING_NOTICE_REQUIRED`,
`ATTACHMENT_TOTAL_EXCEEDED`. There is no HTTP route that purges; retention runs from the command line. See
[flows/sales-activities](flows/sales-activities.md).

Companies and contacts follow a visibility rule, not just a permission: Directors see every company;
other users see companies they created or that have one of their own leads. An invisible company is
reported as `404 COMPANY_NOT_FOUND`, exactly like a missing one. Lead DTOs now carry `company`,
`primaryContact` and `additionalContacts`; `companyName` is the linked company's name (the original
text only for leads not yet linked), and `companyName` is no longer accepted when creating or updating
a lead. `POST /leads` takes `companyId`, `primaryContactId` and `additionalContactIds`; change them later
with `PATCH /leads/{id}/relationships`. See [flows/companies-and-contacts](flows/companies-and-contacts.md).

Business Development lead permissions are scoped to records they own. Directors can view all
leads. Technical Lead and Finance lead access remains denied pending stakeholder approval. New leads
are assigned to their creator; reassignment is not implemented. Pipeline transitions are forward-only;
Won conversion awaits signed-ToR workflow implementation.

User list pagination defaults to `page=1` and `pageSize=25`; page size is capped at 100. The
currently seeded role keys are `director`, `business_development`, `technical_lead`, and `finance`.

### Sales workflow (SOW §4.4–4.7)

All routes are private (bearer token), scoped to leads the caller may see, and return the standard error envelope. Money is a decimal string.

| Method and path                                                                             | Permission                             | Notes                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `GET/POST /leads/{id}/qualification`, `GET …/qualification/history`                         | `leads:read` / `leads:update`          | BANT; score calculated by the server                                |
| `POST /leads/{id}/qualify`                                                                  | `leads:update`                         | The only route to Qualified; override needs a Director and a reason |
| `GET/PUT /settings/qualification`                                                           | `leads:read` / `settings:manage`       | Weights and pass mark                                               |
| `GET/POST /leads/{id}/tor`, `PUT …/tor/draft`, `POST …/tor/versions`                        | `tors:read` / `tors:write`             | Versioned ToR; `POST …/versions` returns 201                        |
| `GET …/tor/versions/{n}`, `GET …/tor/versions/{from}/diff/{to}`                             | `tors:read`                            | Version and change log                                              |
| `POST …/tor/approve-discount`                                                               | `tors:approve`                         | Director only                                                       |
| `POST …/tor/send`, `POST …/tor/versions/{n}/sign`                                           | `tors:write`                           | Send freezes; second signature converts                             |
| `GET …/tor/versions/{n}/pdf`                                                                | `tors:read`                            | `application/pdf`                                                   |
| `GET/POST/PUT /catalogue`                                                                   | `catalogue:read` / `catalogue:manage`  | Reusable scope items (copied into a ToR)                            |
| `GET/POST /leads/{id}/quotations`, `…/from-tor`, `…/quick`, `…/{qid}/status`, `…/{qid}/pdf` | `quotations:read` / `quotations:write` | Acceptance never converts                                           |
| `GET /clients`, `/clients/by-lead/{leadId}`, `/clients/{id}`                                | `clients:read`                         | Read-only                                                           |
| `GET /pipeline/summary`                                                                     | `leads:list`                           | Counts within the caller's scope                                    |

Error codes added: `USE_QUALIFY_ENDPOINT`, `QUALIFICATION_NOT_ASSESSED`, `QUALIFICATION_NOT_PASSED`, `OVERRIDE_REQUIRES_DIRECTOR`, `QUALIFICATION_WRONG_STAGE`, `TOR_NOT_FOUND`, `TOR_EXISTS`, `TOR_LEAD_NOT_QUALIFIED`, `TOR_VERSION_NOT_DRAFT`, `TOR_VERSION_ALREADY_OPEN`, `TOR_SIGNED`, `TOR_NOTHING_IN_SCOPE`, `TOR_DISCOUNT_APPROVAL_REQUIRED`, `TOR_VERSION_NOT_SENT`, `TOR_VERSION_SUPERSEDED`, `TOR_PARTY_ALREADY_SIGNED`, `TOR_AUTONOVA_SIGNER_MUST_BE_DIRECTOR`, `TOR_LEAD_CLOSED`, `QUOTATION_TOR_NOT_SENT`, `QUOTATION_INVALID_TRANSITION`, `QUOTATION_ALREADY_PAST`.

## Authentication and access

Protected requests use `Authorization: Bearer <accessToken>`. Access tokens expire after 15 minutes
by default. Roles and permissions are read from the server when `/auth/me` is requested. Accounts
with MFA requirements may have a restricted session until their second factor is verified. Refresh
tokens are HttpOnly cookies (`autonova_refresh`, `Path=/api/v1/auth`) and are never included in JSON responses.

`POST /auth/refresh` exchanges that cookie for a new access token and rotates the cookie. It needs no
bearer token, but requires an allowed `Origin` and the header `X-Autonova-CSRF: 1`; every failure is
`401 REFRESH_TOKEN_INVALID` (or `403 CSRF_REJECTED`). Re-using a rotated token ends the session.
The local Swagger UI can send the cookie after login and supplies the CSRF header automatically.

| Method | Path                                | Auth                                                  | Notes                                                                                                                                                          |
| ------ | ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/refresh`              | refresh cookie + `Origin` + `X-Autonova-CSRF: 1`      | New access token (same body as login); rotates the cookie                                                                                                      |
| GET    | `/api/v1/auth/sessions`             | bearer, any signed-in user (also restricted sessions) | Your own live sessions: `id`, `createdAt`, `expiresAt`, `current`, `ip`, `userAgent`. Never token data                                                         |
| DELETE | `/api/v1/auth/sessions/{sessionId}` | bearer, any signed-in user                            | Revokes one of your own sessions and its refresh tokens; `404 SESSION_NOT_FOUND` for unknown/foreign/ended ids; revoking the current session clears the cookie |
| POST   | `/api/v1/auth/logout`               | bearer                                                | Revokes the current session and its refresh tokens; clears the cookie                                                                                          |

User and lead endpoints require the permission shown in the table. An authenticated user without the needed
permission receives `403 FORBIDDEN`. Missing or invalid credentials receive `401`.

## Request and error conventions

- Send and receive JSON. IDs are UUIDs and timestamps are ISO-8601 UTC strings.
- Request bodies reject unknown properties on user administration routes.
- Errors use a consistent envelope with `statusCode`, `code`, `message`, `requestId`, `timestamp`,
  and `path`. Validation errors can include field-level `details`.
- Common statuses: `400` invalid input, `401` not authenticated, `403` missing permission,
  `404` not found, `409` conflict, `422` business rule failure, and `429` rate limited.
- The `x-request-id` response header can be used to correlate a report with server logs.
- Swagger documents the error envelope and the possible error responses (with their `code`s) on
  every operation, so you can see what a call can return before you try it. Authentication failures
  are deliberately generic (for example, a wrong password and an unknown email look the same).
- `apps/api/test/openapi.e2e-spec.ts` guards the generated document: every operation needs a summary
  and tag, private routes must document `401`/`403`, bodies must document `400`, and no `$ref` may
  point to an unregistered schema.

For implementation-level conventions and stable error codes, see [API conventions](05-api-conventions.md).
