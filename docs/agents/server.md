# Server (`src/server/`)

Entry `src/server.ts`: `handleApiRequest(request)` runs first; `null` means "not `/api/*`" and falls through to the TanStack Start SSR handler. It also registers process-lifetime subscriptions (recall auto-distill, graph watch coalesce) — idempotent, real runtime only; unit tests that import the router opt in themselves.

## Routing (`api-router.ts`)

- One hand-rolled dispatcher: path regexes as `const`s at the top, then an if/else chain in `dispatch()`. Literal paths are checked before id regexes (e.g. `/api/tasks/search` before `TASK_PATH`).
- Pipeline: `/api/healthz` (pre-auth) → `requireLocalOrigin` → `withApiAuth(dispatch)` (bearer) → response gets `x-request-id` / `x-correlation-id` (honours inbound headers matching `REQUEST_ID_RE`) and re-appends `set-cookie`.
- Errors: `expose === true` or a `ZodError` → 400 with message; anything else → 500 `"internal error"` plus a redacted server log.
- `/api/events` (SSE, GET) is the one bearer exemption: `EventSource` cannot set headers, so it uses a single-use ticket from `POST /api/events/ticket`.
- Adding a route = regex const + dispatch branch + controller export. Auth is automatic; no per-route auth checks.

## Hosting

- Dev: `src/server/vite-api-plugin.ts` mounts the same `handleApiRequest` as Vite connect middleware (lazy `ssrLoadModule` so native bindings stay Node-side).
- Prod: bundled `dist/server/server.js`, launched by Electron ([electron.md](electron.md)).

## Events → SSE

`src/server/events.ts` holds a typed emitter and the `AppEvent` discriminated union (project/worktree/group/task lifecycle, `session:finished`, `task:question`, pet events, `memory:*`, `graph:*`, `diagram:show`). Services emit; `controllers/events.controller.ts` streams to the renderer. A new event extends the union first.

## Notable services

`git.ts` (all git via spawn: status/diff/branches/commit/push/PR), `code-graph*.ts` (tree-sitter WASM index + watcher + staleness), `provider-usage/all-adapters.ts` (per-provider usage scraping), `claude-cli.ts` / `agent-accounts.ts` / `agent-latest-versions.ts` (CLI detection, auth state, versions), `sandboxes.ts` (remote VM pairing), `settings.ts` (`getOrCreateApiToken`), `install-*-skill*.ts` (writes skills into user projects), `brief-delivery.ts`, `keybindings.ts`.
