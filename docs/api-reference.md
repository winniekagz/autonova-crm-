# Autonova CRM API reference

**Current API snapshot:** `0.0.0` · **Base path:** `/api/v1` · **Format:** JSON

This reference describes endpoints that exist in the running API today. Leads, quotations, ToRs,
client conversion, billing, and support are planned CRM workflows; they are not available as API
routes yet. The interactive Swagger page and OpenAPI JSON are generated from the API code.

## Open the interactive API docs

Start the local stack from the repository root:

```bash
docker compose --profile app up -d --build
```

Then open:

- Swagger UI: <http://localhost:4000/api/docs>
- OpenAPI JSON: <http://localhost:4000/api/docs-json>
- Web app: <http://localhost:3000>
- API readiness (includes database): <http://localhost:4000/api/v1/health>

Swagger is enabled by default in the local Compose stack. In the production deployment's API
environment, set `SWAGGER_ENABLED=false` unless the API reference is intentionally available there. The `localhost`
links work only on the developer's machine. To share with stakeholders, publish the JSON file from
a review/staging environment or attach an exported copy; do not send local credentials or tokens.

### Try an authenticated request

1. In Swagger, expand `POST /api/v1/auth/login` and sign in with a provisioned account.
2. Copy the `accessToken` from the response.
3. Select **Authorize**, enter the token as a Bearer token, and authorize.
4. Try the protected user and role endpoints allowed by that account's permissions.

Tokens are credentials. Do not paste them into tickets, stakeholder documents, or screenshots. The
login endpoint is limited to 10 attempts per minute per client address; the API-wide limit is 300
requests per minute per client address.

## Endpoints available now

| Method  | Endpoint                     | Access               | Purpose                                                                     |
| ------- | ---------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `GET`   | `/api/v1/health/live`        | Public               | Confirms the API process is running.                                        |
| `GET`   | `/api/v1/health`             | Public               | Readiness check; confirms PostgreSQL is reachable.                          |
| `POST`  | `/api/v1/auth/login`         | Public               | Sign in with email and password; returns an access token.                   |
| `GET`   | `/api/v1/auth/me`            | Bearer token         | Returns the current account's roles, permissions, and MFA state.            |
| `POST`  | `/api/v1/auth/logout`        | Bearer token         | Revokes the current session; returns `204`.                                 |
| `GET`   | `/api/v1/users`              | `users:list`         | Lists users with pagination and optional `q`, `status`, and `role` filters. |
| `POST`  | `/api/v1/users`              | `users:create`       | Creates an invited user. The request does not set status or password.       |
| `GET`   | `/api/v1/users/{id}`         | `users:read`         | Reads one safe user record by UUID.                                         |
| `PATCH` | `/api/v1/users/{id}`         | `users:update`       | Changes a user's display name.                                              |
| `PUT`   | `/api/v1/users/{id}/roles`   | `users:assign_roles` | Replaces the target user's roles; you cannot change your own roles.         |
| `POST`  | `/api/v1/users/{id}/disable` | `users:disable`      | Disables a user and revokes their sessions.                                 |
| `GET`   | `/api/v1/roles`              | `roles:list`         | Lists assignable system roles.                                              |

User list pagination defaults to `page=1` and `pageSize=25`; page size is capped at 100. The
currently seeded role keys are `director`, `business_development`, `technical_lead`, and `finance`.

## Authentication and access

Protected requests use `Authorization: Bearer <accessToken>`. Access tokens expire after 15 minutes
by default. Roles and permissions are read from the server when `/auth/me` is requested. Accounts
with MFA requirements may have a restricted session until their second factor is verified. Refresh
tokens are HttpOnly cookies (`autonova_refresh`, `Path=/api/v1/auth`) and are never included in JSON responses.

`POST /auth/refresh` exchanges that cookie for a new access token and rotates the cookie. It needs no
bearer token, but requires an allowed `Origin` and the header `X-Autonova-CSRF: 1`; every failure is
`401 REFRESH_TOKEN_INVALID` (or `403 CSRF_REJECTED`). Re-using a rotated token ends the session.
Browsers only: Swagger UI cannot send the cookie.

| Method | Path                                | Auth                                                  | Notes                                                                                                                                                          |
| ------ | ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/refresh`              | refresh cookie + `Origin` + `X-Autonova-CSRF: 1`      | New access token (same body as login); rotates the cookie                                                                                                      |
| GET    | `/api/v1/auth/sessions`             | bearer, any signed-in user (also restricted sessions) | Your own live sessions: `id`, `createdAt`, `expiresAt`, `current`, `ip`, `userAgent`. Never token data                                                         |
| DELETE | `/api/v1/auth/sessions/{sessionId}` | bearer, any signed-in user                            | Revokes one of your own sessions and its refresh tokens; `404 SESSION_NOT_FOUND` for unknown/foreign/ended ids; revoking the current session clears the cookie |
| POST   | `/api/v1/auth/logout`               | bearer                                                | Revokes the current session and its refresh tokens; clears the cookie                                                                                          |

User endpoints require the permission shown in the table. An authenticated user without the needed
permission receives `403 FORBIDDEN`. Missing or invalid credentials receive `401`.

## Request and error conventions

- Send and receive JSON. IDs are UUIDs and timestamps are ISO-8601 UTC strings.
- Request bodies reject unknown properties on user administration routes.
- Errors use a consistent envelope with `statusCode`, `code`, `message`, `requestId`, `timestamp`,
  and `path`. Validation errors can include field-level `details`.
- Common statuses: `400` invalid input, `401` not authenticated, `403` missing permission,
  `404` not found, `409` conflict, `422` business rule failure, and `429` rate limited.
- The `x-request-id` response header can be used to correlate a report with server logs.

For implementation-level conventions and stable error codes, see [API conventions](05-api-conventions.md).
