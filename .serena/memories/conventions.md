# Conventions

## Server layering (strict, no shortcuts)

`controller → service → repository`
- **Controller** (`src/server/controllers/*.controller.ts`): HTTP only. Zod schemas declared at top of file; parse via `parseJsonBody` / `parseSearchParams` / `parsePathParams` / `idParam`; respond via `json` / `jsonError` / `noContent` / `notFound` from `controllers/_helpers.ts`; catch with `rethrowUnlessDomain(e)`. Never touches the DB.
- **Service** (`src/server/services/*.ts`): domain logic, invariants, transactions (`getSqlite().transaction`), `events.emit(...)`, ids via `newId(prefix)` (`services/_ids.ts`). Throws `DomainError` subclasses from `src/server/errors.ts` (`NotFoundError` / `ValidationError` / `UnauthorizedError` / `ConflictError`) — never references HTTP.
- **Repository** (`src/server/repositories/*.repo.ts`): drizzle queries only, no events, no validation. LIKE searches use `escapeLike` + `likeEscaped` (`repositories/_sql.ts`).
- Status codes always come from `~/shared/http-status` constants — no bare numbers.

## Naming / file layout

- `*.controller.ts`, `*.repo.ts`; services are plain nouns. `_`-prefixed modules (`_helpers`, `_ids`, `_sql`, `_spawn`, `_cooldowns`) are shared internals of their layer.
- Tests colocated in `__tests__/` next to the code, `*.test.ts`, vitest.
- Test seams are explicit DI setters, not module mocks: `_setXDepsForTests({...})` exported from the module under test, reset in `afterEach`. Real filesystem via `fs.mkdtempSync` is preferred over mocking `fs`.

## Style

- 2-space indent, double quotes, semicolons, trailing commas; ~100 col. **No prettier/formatter** in the repo — match the surrounding file.
- eslint relaxations to know: `no-explicit-any` off, `prefer-const` off, `react-hooks/exhaustive-deps` off, unused vars are warnings with `^_` escape hatch.
- Comments carry the **why** (often the incident/regression that motivated the code) and are load-bearing documentation — preserve them when editing; keep the same density when adding code. No process narration.
- Exported types get dense JSDoc; discriminated unions (`{ok: true} | {ok: false, ...}`) are the house result shape instead of throwing across boundaries.
- `~/…` imports inside `src/`; relative `../src/...` from `electron/`.

## Security conventions (treat as invariants)

- Never add to `ANONYMOUS_ROUTES`; never bypass `requireLocalOrigin` / `requireBearerToken`.
- Secret comparisons use `timingSafeEqual` (`server/auth.ts`).
- PTY spawn requests must declare their boundary: agent allow-list (`agent: …`) **or** `shell: true` — never let a renderer-supplied command through the agent branch (`src/shared/pty-spawn-policy.ts`).
- Duplicated redaction/validation logic across processes (clone-error scrub, SSH remote allow-list) must stay byte-identical — see `docs/refactor-plan.md` §0.2.
