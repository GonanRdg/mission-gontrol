# Server (`src/server/`)

Entry `src/server.ts`: `handleApiRequest(request)` runs first; `null` means "not `/api/*`" and falls through to the TanStack Start SSR handler. Also where process-lifetime subscriptions are registered (recall auto-distill, graph watch coalesce) — idempotent, real-runtime only; unit tests importing the router opt in themselves.

## Routing (`api-router.ts`)

- One hand-rolled dispatcher: path regexes as `const`s at the top, then a long if/else chain in `dispatch()`. Literal paths are checked before id-regexes (e.g. `/api/tasks/sweep-disconnected` before `TASK_PATH`).
- Request pipeline: `/api/healthz` (pre-auth) → `requireLocalOrigin` → `withApiAuth(dispatch)` (bearer) → response gets `x-request-id` / `x-correlation-id` (honors inbound headers matching `REQUEST_ID_RE`) and re-appends `set-cookie`.
- Errors: `expose === true` or a `ZodError` → 400 with message; anything else → 500 `"internal error"` + redacted server log.
- `/api/events` (SSE, GET) is the one bearer exemption: `EventSource` can't set headers, so it uses a single-use ticket from `POST /api/events/ticket`.
- Adding a route = regex const + dispatch branch + controller export. Auth is automatic; do not add per-route auth checks.

## Hosting

- Dev: `src/server/vite-api-plugin.ts` mounts the same `handleApiRequest` as Vite connect middleware (lazy `ssrLoadModule` so native bindings stay Node-side).
- Prod: bundled `dist/server/server.js`, launched by Electron (`mem:electron/core`).

## Events → SSE

`src/server/events.ts` holds a typed emitter and the `AppEvent` discriminated union (project/worktree/group/task lifecycle, `session:finished`, `task:question`, pet events, `memory:*`, `graph:*`, `diagram:show`). Services emit; `controllers/events.controller.ts` streams to the renderer. New event = extend the union first.

## Notable services

`git.ts` (all git via spawn: status/diff/branches/commit/push/PR), `code-graph*.ts` (tree-sitter WASM index + watcher + staleness), `provider-usage/all-adapters.ts` (per-provider usage scraping), `claude-cli.ts` / `agent-accounts.ts` / `agent-latest-versions.ts` (CLI detection, auth state, versions), `sandboxes.ts` (remote VM pairing), `settings.ts` (`getOrCreateApiToken`), `install-*-skill*.ts` (writes skills into user projects), `brief-delivery.ts`, `keybindings.ts`.

Layer rules and error mapping: `mem:conventions`.
