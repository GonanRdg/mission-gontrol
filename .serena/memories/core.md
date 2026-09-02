# Mission Control — core

Electron desktop "control surface" for running agentic coding CLIs (Claude Code, Codex, Cursor CLI, opencode) across many git projects. Real PTYs in a terminal grid + a loopback HTTP API those CLIs post back to. MIT. `package.json` version is the single version source (`__MC_VERSION__` vite define).

**This checkout is a public fork** (`GonanRdg/mission-control`, from `AgentSystemLabs/mission-control`) that diverges from upstream on distribution: auto-update removed, CI disabled, unsigned local builds, calver versions. Before releasing, packaging or touching update code, read `mem:release`.

## Three processes, one repo

| Process | Code | Notes |
|---|---|---|
| Electron main | `electron/` | window, PTYs, IPC, sandboxes, updater — see `mem:electron/core` |
| App server | `src/server/`, `src/server.ts` | TanStack Start + `/api/*` router — see `mem:server/core` |
| Renderer | `src/routes/`, `src/components/`, `src/lib/`, `src/queries/` | React 19 — see `mem:frontend/core` |

`src/shared/` = types/pure logic imported by all three. NOT uniformly browser-safe (e.g. `pty-spawn-policy.ts` imports `node:fs`); check imports before pulling a shared module into renderer code.
Persistence: `mem:db/core`. Stack/pins: `mem:tech_stack`. Code style + layering rules: `mem:conventions`. Commands: `mem:suggested_commands`. Definition of done: `mem:task_completion`. Shipping/tagging: `mem:release`. Building the macOS app — arch traps that break Intel, ad-hoc signing vs the "damaged" dialog: `mem:packaging/macos`.

## Project-wide invariants

- Server binds `127.0.0.1` only. Every `/api/*` route requires same-origin (loopback `Origin`/`Host`) **and** a bearer token. `ANONYMOUS_ROUTES` in `api-router.ts` is empty and snapshot-tested — do not add entries.
- API bearer is never seeded into `process.env`; only PTYs that need it get it via a curated env map (`electron/pty-manager.ts`).
- Tokens/tickets are redacted from every log and error body (`redactSensitiveErrorText`, vite-api-plugin, sandbox clone errors).
- Path alias `~/* → src/*` (tsconfig, vite, vitest). `electron/` has its own tsconfig and reaches into src via relative paths (`../src/shared/...`).
- Node 24 is enforced by a `pre*` hook on nearly every npm script; run tasks through `pnpm`, not bare binaries.

## Repo docs

- `SPEC.md` approved product spec, `PRODUCT.md` brand + design principles (read before UI work), `TODO.md` product backlog, `CHANGELOG.md` newest-first emoji bullets.
- `docs/*.md` = design/implementation plans (worktrees, sandboxes on AWS/DO, provider usage, agent-status detection, session orchestrator briefs).
- `docs/refactor-plan.md` = verified duplication/cleanup backlog with `file:line` refs; check it before "fixing" a duplication you spot.
- `.agents/skills/{diagram,recall,release}` = skills this app installs into user projects; `skills-lock.json` pins external skills.
