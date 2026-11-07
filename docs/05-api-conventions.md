# 05 — API conventions

Status: conventions below marked **(implemented)** exist and are tested; others are rules to follow when the first endpoint of that kind is written.

## Basics

- Base path `/api/v1` **(implemented)**. Breaking changes ⇒ `/api/v2`; additive changes stay in v1.
- JSON only. Field names `camelCase`. IDs are UUID strings. Timestamps ISO-8601 UTC. Money as **decimal strings** (`"1250.00"`) with a separate `currency` field — never JSON numbers.
- Resource-oriented plural nouns (`/leads`, `/companies/{id}/contacts`).
- **Business transitions are explicit action endpoints**, not generic PATCH of a status field: `POST /leads/{id}/qualify`, `POST /tor-versions/{id}/send`, `POST /tor-versions/{id}/sign`. This is where authorization and rules attach.
- Retry-sensitive operations (conversion, payment callbacks, sending) accept/derive an idempotency key.

## Validation **(implemented)**

zod schema per request part, attached with `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema: uuidSchema })`. The global `StandardSchemaValidationPipe` rejects bad input with `400`. Unknown body keys are stripped (zod object default) — use `.strict()` where silent stripping would hide client bugs. Shared TypeScript types never replace this check.

## Error envelope **(implemented)**

Every error, including unknown routes:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "details": [{ "path": "email", "message": "Invalid email address" }],
  "requestId": "…",
  "timestamp": "2026-11-07T02:25:09.938Z",
  "path": "/api/v1/…"
}
```

| Status | `code`                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_FAILED` / `BAD_REQUEST`                                                                       |
| 401    | `UNAUTHENTICATED`                                                                                         |
| 403    | `FORBIDDEN`                                                                                               |
| 404    | `NOT_FOUND` (also returned for rows the caller may not see, to avoid ID probing)                          |
| 409    | `CONFLICT` (duplicate, stale `version`)                                                                   |
| 422    | `UNPROCESSABLE` (valid shape, violates a business rule) with a specific `code`, e.g. `TOR_ALREADY_SIGNED` |
| 429    | `RATE_LIMITED`                                                                                            |
| 500    | `INTERNAL_ERROR` (details only in logs)                                                                   |

`requestId` equals the `x-request-id` response header (client-supplied value echoed if ≤128 chars, else generated) **(implemented)**. Exception: the readiness endpoint returns the Terminus health body on failure (503) so probes get per-dependency detail **(implemented)**.

## Pagination, filtering, sorting

- Offset pagination: `?page=1&pageSize=25` (default 25, max 100) via `paginationQuerySchema` **(implemented in packages/validation)**. Response `Paginated<T>` = `{ items, page, pageSize, total }` **(type in contracts)**.
- Filters are explicit query params per resource (`?ownerId=&stage=&q=`); `q` is a case-insensitive search on documented fields.
- Sorting: `?sort=field` / `?sort=-field` from a per-resource allow-list.
- Keyset pagination is adopted per endpoint only if a measured list outgrows offset paging.
- List endpoints use Prisma `select` of only the fields the screen needs; no unbounded lists.

## Authentication in requests

`Authorization: Bearer <access token>` for API calls; refresh token in an HttpOnly cookie with `Path=/api/v1/auth` (Phase 1, see [06](06-security-and-access-control.md)); refresh/logout also require a custom header and an Origin check (CSRF). Swagger is configured with bearer auth.

## Documentation

Every controller route has `@ApiTags`, summary, and request/response schema. Swagger UI `/api/docs`, JSON `/api/docs-json` **(implemented)**. An endpoint is documented in a flow doc as implemented only after an e2e test covers it.

## Endpoints currently implemented

| Method | Path                  | Auth                                     | Purpose                                                                                                             |
| ------ | --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/health/live` | public                                   | Liveness                                                                                                            |
| GET    | `/api/v1/health`      | public                                   | Readiness (database ping, 2 s timeout)                                                                              |
| POST   | `/api/v1/auth/login`  | public (throttled 10/min/IP)             | Email + password → `{ accessToken, tokenType, expiresIn, mfaRequired }`. Every failure is `401 INVALID_CREDENTIALS` |
| GET    | `/api/v1/auth/me`     | bearer (allowed for restricted sessions) | Current user, **current** roles/permissions, MFA state                                                              |
| POST   | `/api/v1/auth/logout` | bearer (allowed for restricted sessions) | Revokes the current session; 204                                                                                    |

| GET | `/api/v1/users` | bearer + `users:list` | Paginated list; filters `q`, `status`, `role`; `page`, `pageSize` (≤100) |
| POST | `/api/v1/users` | bearer + `users:create` | Invite (created `INVITED`, no password). Body is `.strict()` |
| GET | `/api/v1/users/{id}` | bearer + `users:read` | One user (safe DTO) |
| PATCH | `/api/v1/users/{id}` | bearer + `users:update` | `{ fullName }` only |
| PUT | `/api/v1/users/{id}/roles` | bearer + `users:assign_roles` | `{ roles, reason? }`; never your own |
| POST | `/api/v1/users/{id}/disable` | bearer + `users:disable` | `{ reason? }`; revokes all sessions |
| GET | `/api/v1/roles` | bearer + `roles:list` | Assignable roles |

Auth error codes in use: `UNAUTHENTICATED` (401; deliberately identical for missing, malformed, bad-signature, revoked, expired-session and disabled-user), `TOKEN_EXPIRED` (401; only for a validly signed but expired access token, so the client knows to refresh), `INVALID_CREDENTIALS` (401), `MFA_REQUIRED` (403; the session must verify a second factor first), `FORBIDDEN` (403; authenticated but missing a required permission), `RATE_LIMITED` (429). User administration adds `USER_NOT_FOUND` (404), `EMAIL_ALREADY_REGISTERED` (409) and the 422 rule codes `SELF_ROLE_CHANGE_FORBIDDEN`, `SELF_DISABLE_FORBIDDEN`, `LAST_DIRECTOR`, `NO_ROLES`, `USER_ALREADY_DISABLED`, `UNKNOWN_ROLE`. A path that matches no route is a plain 404 (Nest answers before any guard); every route that exists is private unless `@Public()`, which a test enumerates.
