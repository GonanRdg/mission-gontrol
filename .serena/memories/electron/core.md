# Electron main (`electron/`)

Separate tsconfig, compiled by `tsc` to CommonJS in `dist-electron/` (a `package.json` with `{"type":"commonjs"}` is written next to it). Reaches shared code by relative path (`../src/shared/...`).

## IPC contract (3 files must move together)

`electron/ipc-channels.ts` (`IPC` map of channel strings) → `src/shared/electron-contract.ts` (typed `ElectronBridge`, result unions like `FileReadResult` / `FileWriteResult`) → `electron/preload.ts` → renderer wrapper `src/lib/electron.ts`. `getElectron()` returns `null` outside Electron, so renderer code must degrade gracefully. Handlers are registered via `ipc-safe-handle.ts` (never throws raw across the boundary).

## PTYs

`pty-manager.ts` owns `node-pty` and is the only process that spawns. Spawn requests are validated by the shared pure policy `src/shared/pty-spawn-policy.ts`: either an allow-listed `agent` command or an explicit `shell: true` free-form terminal; cwd must sit under a granted project root (`project-roots.ts`), `home: true` shells get `os.homedir()` substituted by the handler, not the renderer. Output is batched (`pty-output-batch.ts`) and sequenced. The API token reaches agent PTYs only through the curated `mcEnv` map (`pty-hook-env.ts`, `src/shared/mission-control-hook-env.ts`).

## Serving the app

- Dev: `scripts/dev-local.mjs` picks the first free port from 5173, sets `MC_USER_DATA_DIR=<repo>/.dev-userdata`, `MC_DEV_URL`/`MC_SERVER_ORIGIN`, then launches Electron against Vite.
- Prod: `server-runner.mjs` runs the bundled server resolved by `production-server-entry.ts` (ordered candidate list covering `app.asar`, `resources/app`, and a legacy `dist-server` path). Port chosen by `runtime-port.ts` (never reuses the dev port) and written to `$USER_DATA_DIR/.port`.

## Other subsystems

- **Sandboxes**: `sandbox-manager.ts` + `sandbox-{registry,store,settings,types,agent-client}.ts` — remote AWS VMs running `@agentsystemlabs/mission-control-agent`; git clone errors and SSH remotes are scrubbed/allow-listed and that logic is duplicated in the agent repo — keep in sync (`docs/refactor-plan.md` §0.2).
- **File writes**: `open-path-policy.ts` marks auto-executing config paths (agent hooks, `.git/hooks`, `package.json`) as protected; generic `files:write` returns `protected-path` and the renderer must retry `files:writeSensitive`, which shows a native confirm (`user-declined` is a normal outcome, not an error).
- **Installers**: `ensure-diagram-skill.ts`, `ensure-recall-skill.ts`, `ensure-recall-mcp.ts`, `agent-hooks.ts` write into the user's agent config; `agent-cli-*.ts` detect/update the CLIs.
- **Updater**: `update-manager.ts` (electron-updater, generic feed at agentsystem.dev) — see `mem:release` for why a GitHub Release alone doesn't move users.
- Misc: `whisper-server.ts` (local push-to-talk transcription), `focus-mode.ts`, `session-finish-notification.ts`, `preview-server.ts`, `shell-env.ts`, `windows-cmd.ts`.
