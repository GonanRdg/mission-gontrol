# Renderer (`src/routes`, `src/components`, `src/lib`, `src/queries`)

## Routes

Only 5 file routes: `__root.tsx` (chrome, overlays, panels — `activePanel` state lives here), `index.tsx` (Mission Control grid), `projects.$id.tsx` (**the app**, ~4.8k lines: session grid, terminals, git views, dialogs), `settings.tsx`, `focus.$taskId.tsx` (focus-mode window). `src/routeTree.gen.ts` is generated (`pnpm generate:routes`, also run by `pnpm typecheck`) — never hand-edit.

## Data flow

- HTTP goes through the single typed client `src/lib/api.ts` (`api.listProjects()`, …). `req<T>` attaches `Authorization: Bearer` automatically: renderer token arrives via Electron IPC `settings:getToken` → `setApiToken`; during SSR a resolver reads the server token and requests are prefixed with `DEV_SERVER_ORIGIN` (Node fetch rejects relative URLs). Failures throw `ApiError { status, body }`; 204 → `undefined`.
- TanStack Query: **every** key is defined in `src/queries/index.ts` `queryKeys`, hierarchical so scope invalidation cascades: `["projects", id, "worktrees", worktreeId|main, "scopes", scopeId|local, "tasks"]`. Options factories are `xQueryOptions()`; several use `placeholderData` from `src/lib/shell-query-cache.ts` for instant first paint.
- Live updates: `useServerEvents` (`src/lib/use-events.ts`) — exactly **one** shared `EventSource` per renderer, ticket-authenticated, 1.5s reconnect backoff, fans out to N cheap listeners which invalidate queries. Don't open another EventSource.

## State

No Redux/Zustand. Module-level stores + React Context providers in `src/lib/` consumed with `useSyncExternalStore`: `terminal-store.tsx` (agent sessions), `user-terminal-store.tsx` (shell terminals), `scratch-pad-store`, `agent-question-store`, `pet/pet-store.ts`. Persisted UI prefs go through `local-storage-json.ts` / `ui-preference-cache.ts` / `boolean-preference-cache.ts`; heavy blobs (screenshot previews) are deliberately not persisted.

## Terminals

Renderer never spawns a process — it calls `electron.pty.*` / `electron.remotePty.*`.
- `pty-stream-router.ts`: one IPC listener per transport, demuxed by `ptyId` to the pane that *claimed* it; output for an unclaimed pty is buffered (bounded per-pty and total) and handed over on claim. Keeps per-chunk work O(1) in panes.
- `session-warm-pool.ts` / `user-terminal-warm-pool.ts` pre-spawn PTYs; `pty-spawn-queue`, `terminal-build-queue`, `terminal-surface-cache` throttle and cache xterm surfaces; `terminal-replay.ts` sequences data (`seq`) for replay.
- Sessions are keyed by project + worktree + scope: `scopeKeyForProject` (`lib/scoped-project.ts`), `worktreeScopeKey`, `LOCAL_SCOPE_ID` / `MAIN_WORKTREE_ID` sentinels.

## Components

`ui/` = primitives (Btn, Modal, Icon, TextField, Tooltip, CardFrame, StatusDot…) — reuse before inventing. `views/` = features (SessionGrid, TerminalPane, ProjectBar, GitDiffView/, *SettingsPage, dialogs, overlays). `pet/` = the Mission Pet. Design tokens + keyframes live in `src/styles.css`; two theme families (painted pixel-art, dark-only; flat, dark+light) plus accent color and surface tint. Read `PRODUCT.md` design principles before UI changes.
