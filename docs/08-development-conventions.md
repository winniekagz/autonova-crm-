# 08 — Development conventions

## Repository

- pnpm workspaces; dependency versions shared via the `catalog:` in `pnpm-workspace.yaml`. Install scripts are deny-by-default (`allowBuilds` lists the few that need them).
- Conventional-style commit messages (`feat(api): …`, `docs: …`). One flow per branch/PR where practical.
- No secrets in git. `.env` is ignored; `.env.example` documents every variable.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` (shared `@autonova/config`).
- **ESM everywhere**: relative imports end in `.js`; no `__dirname` (use `import.meta.dirname`).
- No `any` (lint error), no non-null assertions (`!`), no `as` casts to silence the compiler. Narrow with schemas or type guards. Floating promises are lint errors.
- Shared packages build to `dist` and are consumed through their `exports`; run `pnpm build:packages` after changing one (root scripts do it for you).

## Backend

- Folder per module: `apps/api/src/modules/<name>/{presentation,application,domain,infrastructure}` — create layers only when needed.
- Controllers: validate (zod) → authorize → call one use case → return a response DTO. No business rules, no Prisma.
- Never return Prisma models; map to response DTOs (also avoids leaking `passwordHash` etc.).
- Never spread request bodies into Prisma `data`. Whitelist fields explicitly.
- Authentication, authorization and audit are separate foundational Nest modules used by every business module; controllers declare permissions via decorators and call the audit service from use cases — role checks and audit logic are never hand-written per controller.
- Audit snapshots use explicit per-entity field allow-lists, never whole entities.
- Multi-record operations in a Prisma `$transaction`, with the audit write inside it.
- Queries: `select` only needed fields, paginate, avoid N+1 (batch with `include`/`in`); enable query logging while developing a new endpoint.
- Money via `Prisma.Decimal` / decimal library; never `number`.
- New environment variable ⇒ add it to `env.ts`, `.env.example`, compose, and README.

## Database changes (every one)

1. Edit `schema.prisma`. 2. `pnpm --filter @autonova/api exec prisma migrate dev --create-only --name <intent>`. 3. Review the SQL; add MANUAL constraints/triggers. 4. Add the header (Reason / Impact / Recovery). 5. Apply, add tests, update [04](04-database-design.md). Never `migrate reset` against a non-throwaway database without explicit authorisation.

## Frontend

- Next.js App Router, server components by default; client components only for interactivity.
- Tailwind with the brand tokens in `globals.css` (navy/cyan). Mobile-first (lead capture and visit reports are phone use cases).
- Every data view has loading, empty, error and success states.
- Server state (anything the API owns) is read with TanStack Query: one `<feature>.queries.ts` per feature holds its query keys and hooks, always through `useAuthedRequest` so token renewal still applies. Reads retry once, and only for network failures and 5xx (`lib/query-client.ts`); writes never retry. The cache is emptied when the session ends. Search, filters and page live in the URL (`hooks/use-url-params.ts`), not in component state. Do not fetch inside `useEffect`.
- Forms use React Hook Form with a Zod schema (`zodResolver`). The schema sits beside the form (`*-schema.ts`) and reuses the shared rules in `@autonova/validation`; it is the early, friendly check only, the API validates everything again. Field errors from the API are shown on the form's own fields through `lib/form-errors.ts`, which ignores any field name the form does not own. Typed values stay in the form after a failure; sign-in is the one exception, where the password is cleared. Use `Controller` only for controls that are not native inputs (role pickers), and `register` for the rest.
- The web app calls the API only; it never imports Prisma or backend code. Types come from `@autonova/contracts`.

## Documentation

Update, don't regenerate. A flow doc's "Implementation status" and the API conventions' endpoint table change **only** when the behaviour exists and is verified. Record unresolved questions in `implementation/progress.md`.

## Definition of done (summary of directive §11)

Business rules, authorization and DB constraints enforced server-side · validation at the boundary · consistent errors · loading/empty/success/failure UI states · tests pass (actually run) · no `any`/unsafe casts · no secrets · docs match reality.
