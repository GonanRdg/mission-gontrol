# Mission Gontrol

Electron desktop control surface for running agentic coding CLIs (Claude Code, Codex, Cursor CLI, opencode) across many git projects: real PTYs in a terminal grid plus a loopback HTTP API the CLIs post back to. `package.json` version is the single version source (`__MC_VERSION__` vite define).

**Public fork** of `AgentSystemLabs/mission-control` (MIT, upstream copyright kept). Diverges on distribution: GitHub Actions disabled, auto-update removed, unsigned local builds, calver versions. Read [docs/agents/release.md](docs/agents/release.md) before releasing, packaging or touching update code.

## Three processes, one repo

| Process | Code | Details |
|---|---|---|
| Electron main | `electron/` | [docs/agents/electron.md](docs/agents/electron.md): IPC contract, PTYs, serving, sandboxes |
| App server | `src/server/`, `src/server.ts` | [docs/agents/server.md](docs/agents/server.md): routing, auth pipeline, SSE events |
| Renderer | `src/routes/`, `src/components/`, `src/lib/`, `src/queries/` | [docs/agents/frontend.md](docs/agents/frontend.md): data flow, state, terminals |

- `src/shared/` = types and pure logic used by all three. Not uniformly browser-safe (`pty-spawn-policy.ts` imports `node:fs`); check imports before using a shared module in renderer code.
- Persistence (SQLite, schema in three places): [docs/agents/db.md](docs/agents/db.md).
- Theming (style × appearance axes, token layers, terminal contrast): [docs/agents/theming.md](docs/agents/theming.md).
- macOS packaging (arch traps that break Intel, ad-hoc signing): [docs/agents/packaging-macos.md](docs/agents/packaging-macos.md).

## Invariants

- Server binds `127.0.0.1` only. Every `/api/*` route requires same-origin (loopback `Origin`/`Host`) **and** a bearer token. `ANONYMOUS_ROUTES` in `api-router.ts` is empty and snapshot-tested — never add entries; never bypass `requireLocalOrigin` / `requireBearerToken`.
- The API bearer is never seeded into `process.env`; only PTYs that need it get it via a curated env map (`electron/pty-manager.ts`).
- Tokens and tickets are redacted from every log and error body (`redactSensitiveErrorText`, vite-api-plugin, sandbox clone errors). Secret comparisons use `timingSafeEqual` (`server/auth.ts`).
- PTY spawn requests declare their boundary: allow-listed `agent` **or** `shell: true` — never route a renderer-supplied command through the agent branch (`src/shared/pty-spawn-policy.ts`).
- Redaction/validation logic duplicated across processes (clone-error scrub, SSH remote allow-list) must stay byte-identical — `docs/refactor-plan.md` §0.2.
- Path alias `~/* → src/*` (tsconfig, vite, vitest). `electron/` has its own tsconfig and imports src via relative paths (`../src/shared/...`).

## Conventions

**Server layering** — `controller → service → repository`, no shortcuts:
- Controller (`src/server/controllers/*.controller.ts`): HTTP only. Zod schemas at top of file; parse via `parseJsonBody` / `parseSearchParams` / `parsePathParams` / `idParam`; respond via `json` / `jsonError` / `noContent` / `notFound` (`controllers/_helpers.ts`); catch with `rethrowUnlessDomain(e)`. Never touches the DB.
- Service (`src/server/services/*.ts`): domain logic, invariants, transactions (`getSqlite().transaction`), `events.emit(...)`, ids via `newId(prefix)` (`services/_ids.ts`). Throws `DomainError` subclasses (`src/server/errors.ts`) — never references HTTP.
- Repository (`src/server/repositories/*.repo.ts`): drizzle queries only. LIKE searches use `escapeLike` + `likeEscaped` (`repositories/_sql.ts`).
- Status codes come from `~/shared/http-status` constants, never bare numbers.

**Layout and tests**
- `*.controller.ts`, `*.repo.ts`; services are plain nouns. `_`-prefixed modules (`_helpers`, `_ids`, `_sql`, `_spawn`, `_cooldowns`) are layer-internal.
- Tests colocated in `__tests__/`, `*.test.ts`, vitest, node environment (no jsdom).
- Test seams are explicit DI setters (`_setXDepsForTests({...})`, reset in `afterEach`), not module mocks. Prefer a real filesystem via `fs.mkdtempSync` over mocking `fs`.

**Style**
- 2-space indent, double quotes, semicolons, trailing commas, ~100 cols. No formatter in the repo — match the surrounding file.
- eslint: `no-explicit-any` off, `prefer-const` off, `react-hooks/exhaustive-deps` off; unused vars warn with a `^_` escape.
- Comments carry the why (often the regression that motivated the code); preserve them when editing. No process narration.
- Exported types get dense JSDoc. Discriminated unions (`{ ok: true } | { ok: false, ... }`) are the house result shape across boundaries.

## Toolchain

- **Node 24** (`.nvmrc`, `engines >=24 <25`), enforced by `scripts/require-node-24.mjs` as a `pre*` hook on almost every script. Node 26 fails the gate and the natives error with `NODE_MODULE_VERSION`.
- **pnpm 11.1.2** via corepack (`packageManager`). Run tasks through `pnpm`, never bare `vitest`/`tsc`/`electron` — the pre-hooks keep native bindings matching.
- Dependencies pinned exact (`savePrefix: ""` in `pnpm-workspace.yaml`, which also holds security `overrides` and `allowBuilds`).
- Electron 41 · TypeScript 6 (strict) · React 19.2 · Vite 8 · Tailwind 4 (no config file) · eslint 10 flat · TanStack Start + Router + Query 5 · Zod 4 · `better-sqlite3` 12 + drizzle 0.45 · `node-pty` 1.2 beta + `@xterm/xterm` 6 · CodeMirror 6 · mermaid · `web-tree-sitter` · bundled whisper.cpp · `@modelcontextprotocol/sdk`.

**Native-module ABI split** (frequent breakage):
- `better-sqlite3` loads in both the Node dev/test server and packaged Electron; `scripts/ensure-{node,electron}-sqlite.mjs` swap the binding, `src/db/better-sqlite3-native-binding.ts` resolves it at runtime.
- `node-pty` runs only inside Electron (`postinstall` rebuilds it for Electron).
- `pnpm rebuild` = both for Electron (before packaging); `pnpm native:node` = back to Node ABI (test/dev/db scripts do it themselves). If `require('better-sqlite3')` throws after packaging, an `--x64` build replaced the Node binding: run `pnpm native:node`.
- Vite keeps `better-sqlite3`, `node-pty`, `web-tree-sitter` out of the bundle. `@codemirror/state|view|language` are deduped — duplicate copies break `instanceof` and crash the file editor.

## Commands

```bash
pnpm install              # postinstall rebuilds native deps for Electron
pnpm dev                  # scripts/dev-local.mjs: Vite + Electron
pnpm typecheck            # generates routeTree, then tsc for src and electron
pnpm lint
pnpm test                 # native:node + vitest run; one file: pnpm test <path-substring>
pnpm scan:secrets
pnpm build                # web (vite + copy bundled skills) + electron tsc
pnpm install:local        # build + swap into /Applications (see docs/agents/release.md)
pnpm dist:mac | dist:mac:x64   # DMGs, --publish never (see docs/agents/packaging-macos.md)
pnpm db:generate | db:push     # drizzle-kit, dev diffing only
pnpm setup:whisper        # bundled whisper resources (needed for packaging)
pnpm remote-vm deploy aws --name x   # sandbox VM (docs/remote-vm-cli.md)
```

- Dev isolation: `dev-local.mjs` sets `MC_USER_DATA_DIR=<repo>/.dev-userdata` and picks the first free port from 5173 — dev never touches the installed app's DB.
- Installed app state (macOS): `~/Library/Application Support/MissionControl/` → `missioncontrol.db` (0600), `.port`, `skills/`.

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test`, plus:
- `pnpm scan:secrets` when anything could embed a key or token.
- `pnpm audit --audit-level high` when dependencies change; fixes go in `pnpm-workspace.yaml` `overrides`.
- `pnpm build` when vite/electron build config, route generation or bundled-skill copying changes.

Changes that touch several places at once:
- DB shape → `src/db/schema.ts` **and** `ensureSchema()` **and** a new `src/db/migrations/NNNN_*.sql`.
- New `/api` route → regex + dispatch branch + controller + service + repo + `src/lib/api.ts` method + query key/options if the UI reads it.
- New server event → extend `AppEvent` in `src/server/events.ts` and handle it in the renderer SSE listener.
- New IPC channel → `electron/ipc-channels.ts` + `src/shared/electron-contract.ts` + preload + `ipcSafeHandle` in main.

## Repo docs

- `SPEC.md` product spec, `PRODUCT.md` brand and design principles (read before UI work), `TODO.md` backlog, `CHANGELOG.md` newest-first emoji bullets (✨ feature, 🐛 fix).
- `docs/*.md` design and implementation plans. `docs/refactor-plan.md` is the verified duplication/cleanup backlog — check it before "fixing" a duplication.
- `.agents/skills/` holds skills the app installs into user projects; `skills-lock.json` pins external skills.
