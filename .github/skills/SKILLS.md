---
name: clear-error-handling-clean-architecture
description: Apply clean, maintainable TypeScript architecture across React/Next.js frontends and Node/NestJS backends. Use when building, refactoring, reviewing, or debugging features, API errors, forms, state management, validation, hooks, or user feedback.
---

# Clear Error Handling & Clean Architecture

## Purpose

Build reliable, understandable TypeScript applications with clear separation between business logic, application workflows, infrastructure, and presentation.

Apply these standards when implementing or reviewing frontend and backend code. First inspect the repository and follow its established conventions where they are sound. Do not impose a new architecture, duplicate existing abstractions, or refactor unrelated code.

The priorities are:

1. Correct behavior and clear error handling.
2. Separation of business logic from presentation and infrastructure.
3. Consistent validation at trust boundaries.
4. Informative, safe feedback to users.
5. Predictable state ownership.
6. Reuse through shared hooks and pure utilities where it genuinely reduces duplication.
7. Simplicity over abstraction.

## 1. Start by understanding the codebase

Before changing code:

- Inspect the relevant modules, routes, components, services, hooks, schemas, API clients, and tests.
- Identify the existing architecture, naming conventions, error format, validation approach, state libraries, and UI primitives.
- Reuse existing patterns if they are consistent and safe.
- Check package versions and existing dependencies before adding anything.
- Avoid broad refactors when a focused change is sufficient.
- Preserve existing behavior unless the task explicitly changes it.

Do not assume a library is installed. If React Hook Form, `@hookform/resolvers`, Zod, TanStack Query, Zustand, or shadcn/ui is absent, inspect the project conventions and ask or explain before introducing a dependency when dependency changes are not clearly authorized.

## 2. Architecture: separate responsibilities

Keep business rules independent from UI rendering and transport details.

Use the following boundaries where they fit the size of the feature:

### Domain / business logic

Owns rules that describe what the product does:

- Domain entities and value types.
- Business invariants and state transitions.
- Calculations and decision rules.
- Pure validation that expresses business constraints.
- Domain errors that describe meaningful rule violations.

Domain logic must not depend on React, Next.js, NestJS decorators, HTTP request/response objects, Prisma, browser APIs, or UI components.

### Application layer

Coordinates a user or system operation:

- Use cases and workflows.
- Permission checks where appropriate to the application boundary.
- Transaction orchestration.
- Calling domain behavior and repository/service interfaces.
- Mapping operation outcomes into application-level results.

Keep orchestration out of React components and HTTP controllers.

### Infrastructure layer

Implements external details:

- Database repositories and ORM access.
- HTTP clients and external providers.
- Email, storage, queues, payment providers.
- Framework-specific adapters.
- Logging and telemetry implementations.

Do not leak ORM models, provider SDK objects, or raw transport exceptions into the domain or frontend.

### Presentation / delivery layer

Frontend:
- Pages, layouts, components, form rendering, interaction and navigation.
- Displaying loading, success, empty and error states.
- Calling application-facing hooks or API client functions.

Backend:
- Controllers, route handlers, request/response DTOs, guards and exception filters.
- Translate HTTP input into application calls.
- Translate application outcomes into appropriate HTTP responses.

Controllers and components should remain thin. They should not become the home of business rules.

### Practicality rule

Do not create folders, interfaces, factories, repositories, classes, or layers merely to satisfy a diagram. For a small feature, a small pure function or service may be enough. Introduce an abstraction when it isolates a real dependency, protects a business rule, enables testing, or prevents meaningful duplication.

## 3. Error handling principles

Errors are expected outcomes that must be handled deliberately. Never hide failures or expose implementation details.

### Error categories

Distinguish at least:

- **Validation errors:** user input is invalid or incomplete.
- **Authentication errors:** the user is not authenticated or the session is invalid.
- **Authorization errors:** the user is authenticated but lacks permission.
- **Not found:** the requested resource does not exist or is not visible to the caller.
- **Conflict:** the requested operation violates current state or uniqueness constraints.
- **Business-rule errors:** a valid request cannot proceed because a domain rule is not satisfied.
- **Rate-limit errors:** the caller must wait before retrying.
- **Network / timeout errors:** the client could not reliably reach or receive a response from the server.
- **External dependency errors:** a provider or downstream service failed.
- **Unexpected internal errors:** an unanticipated failure occurred.

Do not convert every failure into a generic 400 or 500. Preserve the distinction between client-correctable errors, authorization failures, conflicts, transient failures, and unexpected defects.

### Error-handling rules

- Handle an error at the boundary that has enough context to respond correctly.
- Preserve the original cause when wrapping an error.
- Do not catch an error merely to log it and rethrow it unchanged.
- Do not swallow errors, return fake success values, or silently ignore failed operations.
- Do not use exceptions for ordinary branching when a typed result or explicit condition is clearer.
- Do not expose stack traces, SQL, ORM messages, internal paths, tokens, secrets, provider payloads, or personal data to users.
- Log unexpected failures once at an appropriate boundary; avoid duplicate logs at every layer.
- Include a correlation/request ID where available so support and developers can trace a failure.
- Keep logs structured and useful: operation, request ID, actor/resource identifiers when safe, error category, and cause.
- Never log passwords, access/refresh tokens, session cookies, OTPs, full payment credentials, or sensitive form payloads.
- Retry only operations known to be safe to retry. Use idempotency for mutations that may be retried.
- Do not automatically retry validation, authorization, or other permanent failures.
- Distinguish cancellation/aborted requests from genuine application failures.

## 4. Backend error handling

Apply these rules to NestJS, Express, Next.js route handlers, or the backend framework in use.

### Request boundary

- Validate all untrusted input at the API boundary: body, params, query and relevant headers.
- Use the project's existing DTO/schema validation approach.
- Reject malformed input with a stable validation response.
- Never trust frontend validation as a security or correctness boundary.
- Enforce authentication and authorization on the server for every protected operation.
- Do not rely on hidden buttons or frontend route guards for access control.

### Consistent API error contract

Use one documented, predictable response shape across endpoints. Adapt to an existing project contract rather than introducing a competing one.

A useful conceptual shape is:

```ts
type ApiError = {
  statusCode: number;
  code: string;
  message: string;
  details?: Array<{
    field?: string;
    code: string;
    message: string;
  }>;
  requestId?: string;
};
```

Rules:

- `code` is stable and machine-readable; frontend behavior must not depend on parsing message text.
- `message` is safe and understandable.
- `details` contains field-level validation information only when appropriate.
- `requestId` helps correlate the client report with server logs.
- Do not return internal exception messages for unexpected failures.
- Keep response shape consistent across controllers and exception filters.

### NestJS guidance

Where NestJS is used:

- Use framework exceptions or a centralized exception filter for HTTP translation.
- Use DTO validation pipes or the project's established Zod validation integration.
- Keep controllers thin.
- Keep authorization in guards/policies and application/domain checks as appropriate.
- Map known domain/application errors to intentional HTTP statuses in one predictable place.
- Treat unknown exceptions as internal errors and return a safe generic message.
- Do not put business decisions inside exception filters.
- Do not catch every exception inside every service method.
- Use transactions for multi-step operations that must succeed or fail together.
- Translate known database constraint violations into safe domain/API conflicts where useful; never leak raw SQL or ORM text.

### Status-code guidance

Use status codes semantically:

- `400` malformed request or invalid request structure.
- `401` missing/invalid authentication.
- `403` authenticated but forbidden.
- `404` resource missing or intentionally concealed.
- `409` conflict with current state or uniqueness.
- `422` semantically invalid input or business-rule validation, if consistent with the API contract.
- `429` rate limited.
- `502`/`503`/`504` for appropriate upstream availability/gateway conditions.
- `500` unexpected internal failure.

Choose one consistent convention for validation (`400` or `422`) and document it. Do not vary arbitrarily by endpoint.

## 5. Frontend error handling and user feedback

The UI must tell users what happened, whether their work was saved, and what they can do next.

### Feedback quality

Prefer messages that are:

- Specific to the action.
- Written in plain language.
- Actionable when recovery is possible.
- Honest about whether the operation succeeded.
- Free of internal technical details.

Examples:

- Good: “We couldn’t save this lead. Check your connection and try again. Your changes are still on this form.”
- Good: “This email address is already assigned to another user.”
- Good: “Your session has expired. Sign in again to continue.”
- Poor: “Something went wrong.”
- Poor: “AxiosError: Request failed with status code 500.”
- Poor: “Internal Server Error: PrismaClientKnownRequestError…”

A generic fallback is acceptable only when the cause is genuinely unknown. Include a support reference/request ID when available.

### UI states

For every asynchronous user operation, consider:

- Initial state.
- Loading/pending state.
- Success state.
- Validation state.
- Empty state where relevant.
- Recoverable failure state.
- Permission/authentication state.
- Retry or correction path where appropriate.

Do not show success before the server confirms success.

Prevent accidental duplicate submissions while a mutation is pending. Do not disable the entire page unnecessarily.

Preserve user-entered values after recoverable failures. Do not clear a form because a request failed.

Use inline field errors for field-level validation, and a form-level message for errors that apply to the whole operation.

Use toast notifications for concise transient feedback, not as the only place where important or persistent errors appear.

### Frontend API error normalization

Normalize fetch/client errors at a shared API boundary into a predictable typed error representation.

- Handle non-2xx responses explicitly.
- Handle malformed/unexpected error payloads safely.
- Distinguish network failures from server responses.
- Preserve status, stable error code, safe message, field errors and request ID where available.
- Do not duplicate response parsing and error mapping in every component.
- Never assume every thrown value is an `Error`; JavaScript allows arbitrary thrown values.
- Do not display raw server messages unless the API contract explicitly marks them as safe for users.

## 6. Forms: React Hook Form + Zod

Use **React Hook Form** for form state and submission, and **Zod** for schema validation. Use `@hookform/resolvers/zod` to connect them when the project uses this stack.

### Required conventions

- Define schemas close to the feature or in a shared validation package when genuinely shared.
- Infer TypeScript types from schemas with `z.infer<typeof schema>` rather than maintaining duplicate types.
- Use the same schema on client and server only when runtime compatibility and security requirements allow it. The server must always validate independently.
- Keep UI labels, descriptions and field rendering in presentation components.
- Keep business rules out of JSX and event handlers.
- Use `FormProvider`/`useFormContext` for deeply nested forms when it reduces prop drilling; do not introduce it for every small form.
- Use `Controller` for controlled third-party components that need it. Prefer `register` for compatible native inputs.
- Map server field errors to React Hook Form using `setError`.
- Use `formState.isSubmitting` or mutation pending state to prevent duplicate submissions.
- Preserve entered values after server or network failures.
- Reset only after a confirmed success or an intentional workflow transition.
- Use accessible labels, descriptions, required indicators and error associations.
- Do not rely on browser-native validation alone when schema validation is required.

### Example

```ts
import { z } from "zod";

export const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Enter the lead's name."),
  email: z.email("Enter a valid email address."),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
```

```tsx
const form = useForm<CreateLeadInput>({
  resolver: zodResolver(createLeadSchema),
  defaultValues: {
    name: "",
    email: "",
  },
});

const onSubmit = form.handleSubmit(async (values) => {
  await createLeadMutation.mutateAsync(values);
});
```

Adapt syntax to the installed Zod version; do not assume Zod v4 APIs if the project uses Zod v3.

### Server validation mapping

Map structured API validation details to field errors:

```ts
for (const issue of apiError.details ?? []) {
  if (issue.field) {
    form.setError(issue.field as FieldPath<CreateLeadInput>, {
      type: "server",
      message: issue.message,
    });
  }
}
```

Validate that a server-provided field name is an allowed form field before mapping it. Do not blindly trust arbitrary field paths.

## 7. State management: one source of truth

Choose state based on ownership and lifetime. Do not put all state into one library.

### TanStack Query — server state

Use TanStack Query for data owned by the server:

- Fetching and caching API data.
- Query keys and invalidation.
- Mutations and mutation lifecycle.
- Refetching, stale data and background synchronization.
- Pagination/infinite queries where needed.

Rules:

- Keep query keys centralized or consistently feature-scoped.
- Put API calls in an API/service layer, not directly throughout components.
- Use `useQuery` for reads and `useMutation` for writes.
- Invalidate or update the relevant cache after successful mutations.
- Avoid copying query data into Zustand or local state without a clear reason.
- Do not use effects to manually fetch data when TanStack Query already owns the lifecycle.
- Handle loading, empty, stale and error states deliberately.
- Configure retries intentionally. Do not retry permanent 4xx errors by default.
- Avoid optimistic updates unless rollback and concurrency behavior are understood.

### Zustand — shared client state

Use Zustand only for client-owned state that must be shared across multiple components or routes and is not server data.

Good examples:
- Multi-step workflow state that must survive component boundaries.
- Shared UI state such as a global panel or cross-route selection.
- Client-side preferences not already owned by the server or URL.

Rules:

- Keep stores small and feature-scoped.
- Define typed state and actions.
- Select only the state a component needs to avoid unnecessary rerenders.
- Do not mirror TanStack Query caches in Zustand.
- Do not use Zustand for every form field or temporary component interaction.
- Persist only when there is a clear product requirement; avoid persisting sensitive data.

### React useState / useReducer — local state

Use `useState` for simple component-local state:

- Open/closed dialogs.
- Selected tab.
- Small UI toggles.
- Temporary input or selection state not managed by a form library.

Use `useReducer` when local state has multiple related fields or transitions that are easier to reason about as explicit actions.

Do not introduce a global store for state that belongs to one component.

### URL state

Keep navigable/shareable state in the URL where appropriate:

- Search terms.
- Filters.
- Sort order.
- Pagination.
- Selected resource identifiers.

Avoid duplicating URL state in Zustand unless synchronization is intentionally designed.

### Decision order

1. Is it server-owned data? Use TanStack Query.
2. Must multiple distant components share client-owned state? Consider Zustand.
3. Is it local to one component? Use `useState` or `useReducer`.
4. Is it part of a form? Use React Hook Form.
5. Should it be shareable/bookmarkable? Consider URL state.

## 8. React hooks: use only when they solve a real problem

### useEffect

Use `useEffect` only to synchronize React with an external system, for example:

- Event listeners.
- Browser APIs.
- WebSocket or subscription lifecycles.
- Imperative third-party widgets.
- Timers when genuinely required.
- Manually managed external resources.

Do not use `useEffect` for:

- Deriving one value from props or state.
- Transforming data for rendering.
- Handling a user click or form submission.
- Fetching data already managed by TanStack Query.
- Keeping two pieces of React state synchronized when one can be derived.
- Resetting state as a substitute for correct component identity or controlled state.

Prefer deriving values during render, handling actions in event handlers, and using the appropriate query/mutation lifecycle.

Every effect must have:
- A clear external synchronization purpose.
- Correct dependencies.
- Correct cleanup when needed.
- No hidden business workflow that belongs in an application/use-case layer.

### useCallback

Use `useCallback` when stable function identity has a demonstrated purpose, such as:
- A callback passed to a memoized child.
- A dependency of another hook where identity stability matters.
- An API requiring a stable callback.

Do not wrap every handler in `useCallback`.

### useMemo

Use `useMemo` when:
- A computation is measurably expensive, or
- Stable derived identity is needed for a specific downstream optimization.

Do not memoize trivial string operations, simple array lookups, or every derived value by default.

### Shared hooks

Create shared hooks when they encapsulate genuinely reusable React behavior or feature workflows, such as:

- `useDebouncedValue`.
- `useCurrentUser`.
- `usePermissions`.
- `useCreateLead`.
- `useLeadFilters` when shared by multiple screens.
- A reusable dialog or pagination behavior.

Rules:
- Hooks may compose React hooks and feature services.
- Keep hooks focused on one responsibility.
- Do not move business logic into hooks merely to hide it.
- Avoid one-off hooks that only rename a single `useState` call.
- Keep API transport details in the API layer.
- Keep pure calculations in pure functions.

## 9. Pure functions and utilities

Use utility functions for deterministic logic that does not require React, network, database, or browser state.

Good candidates:
- Currency formatting.
- Date and range calculations.
- Mapping API data into view models.
- Search/filter predicates.
- Numeric calculations.
- Normalization and parsing.
- Reusable validation helpers where appropriate.

Rules:
- Same inputs should produce the same outputs.
- No hidden mutation of arguments or global state.
- No network calls, database access, logging side effects, React hooks or browser dependencies.
- Use descriptive names and explicit input/output types.
- Keep utilities grouped by domain/feature rather than building a giant miscellaneous `utils.ts`.
- Do not create a utility for a trivial one-line expression used once unless it improves clarity.

Business calculations should live in the domain/application layer, even if implemented as pure functions. A generic formatting helper belongs in utilities; a pricing or eligibility rule belongs in the relevant business domain.

## 10. shadcn/ui and presentation components

Use shadcn/ui where it improves consistency, accessibility and delivery speed.

- Reuse existing shadcn components and project wrappers.
- Prefer composition over deeply customized one-off controls.
- Use accessible primitives for dialogs, dropdowns, popovers, selects and forms.
- Do not install or generate components that already exist in the repository.
- Do not use shadcn as a substitute for application architecture.
- Keep business logic out of reusable UI primitives.
- Keep reusable components presentational and configurable through typed props.
- Feature-specific components may compose shared primitives and feature hooks.

Do not add shadcn components merely for decoration or to replace a simple native element without a reason.

## 11. TypeScript standards

- Avoid `any`. Use a real type, `unknown` plus narrowing, or a generic only when it represents a genuinely reusable relationship.
- Avoid unnecessary generics and abstraction-heavy utility types.
- Prefer discriminated unions for finite state and result variants.
- Use exhaustive handling for important domain states.
- Avoid unsafe type assertions. Validate external data before narrowing it.
- Keep API contracts explicit and shared where appropriate.
- Do not duplicate types already inferred from Zod schemas.
- Avoid non-null assertions unless the invariant is guaranteed and documented.

## 12. A practical feature structure

Adapt to the existing repository. A feature might look like:

```text
features/
  leads/
    api/
      leads.api.ts
      leads.queries.ts
      leads.mutations.ts
    components/
      lead-form.tsx
      lead-table.tsx
      lead-detail.tsx
    hooks/
      use-lead-filters.ts
      use-create-lead.ts
    schemas/
      lead.schema.ts
    utils/
      format-lead-label.ts
    types/
      lead.types.ts
```

Backend responsibilities might be separated as:

```text
modules/
  leads/
    domain/
      lead.ts
      lead.errors.ts
      lead.rules.ts
    application/
      create-lead.use-case.ts
      qualify-lead.use-case.ts
    infrastructure/
      prisma-lead.repository.ts
    presentation/
      leads.controller.ts
      dto/
```

These are examples, not mandatory folder names. Follow the actual framework and repository conventions. Do not create empty folders or files just to match the diagrams.

## 13. Implementation workflow

For each feature or bug fix:

1. **Trace the flow:** identify UI, hook, API client, endpoint, validation, business logic, persistence and tests.
2. **Identify ownership:** decide which layer owns each rule and state.
3. **Define failure cases:** list validation, permission, not-found, conflict, network and unexpected failures relevant to the operation.
4. **Define contracts:** establish input/output and error shapes before wiring UI behavior.
5. **Implement the smallest coherent change:** reuse existing abstractions and avoid unrelated refactoring.
6. **Add feedback:** make loading, success, field errors and operation failures understandable.
7. **Test boundaries:** cover both successful and failing paths, especially authorization and business invariants.
8. **Review the result:** remove duplicated logic, unnecessary effects, redundant state, unjustified memoization and swallowed errors.

When reviewing existing code, identify concrete defects and risks rather than requesting stylistic rewrites without measurable value.

## 14. Completion checklist

Before declaring the work complete, verify:

### Architecture
- [ ] Business rules are not embedded in JSX or controllers.
- [ ] Presentation is separated from data access and business workflows.
- [ ] External dependencies are behind appropriate boundaries.
- [ ] No unnecessary layers or abstractions were introduced.

### Errors and feedback
- [ ] API errors have stable codes and predictable structure.
- [ ] Unexpected errors do not leak internals.
- [ ] Validation, auth, permission, conflict and network failures are distinguishable.
- [ ] Users receive clear, actionable feedback.
- [ ] Failed submissions preserve user input.
- [ ] Errors are logged once at an appropriate boundary with safe context.

### Forms and state
- [ ] Forms use React Hook Form and Zod where the project stack supports them.
- [ ] Server validation is independent of client validation.
- [ ] TanStack Query owns server state.
- [ ] Zustand is limited to genuinely shared client state.
- [ ] Local UI state stays local.
- [ ] URL state is used for navigable filters/search where appropriate.

### React
- [ ] No effect is used for derived state or event handling.
- [ ] Every effect synchronizes with an external system and has correct cleanup.
- [ ] `useCallback` and `useMemo` have a clear reason.
- [ ] Shared hooks encapsulate real reusable behavior.
- [ ] Pure logic is testable without rendering React.

### Quality
- [ ] Types are explicit and avoid unnecessary `any`.
- [ ] Tests cover success and important failure paths.
- [ ] Loading, empty, error and success states are handled.
- [ ] No dead controls, fake success states or swallowed exceptions remain.
- [ ] Relevant lint, typecheck, tests and build have been run where available.

## Final principle

Prefer code that a competent engineer can understand quickly and safely change later.

Do not optimize for the fewest lines, the most abstractions, or the most hooks. Optimize for clear ownership, predictable behavior, meaningful errors, testability and maintainability.