# Electron main (`electron/`)

Separate tsconfig, compiled by `tsc` to CommonJS in `dist-electron/` (a `package.json` with `{"type":"commonjs"}` is written next to it). Reaches shared code by relative path (`../src/shared/...`).

## IPC contract (four files move together)

`electron/ipc-channels.ts` (`IPC` channel map) → `src/shared/electron-contract.ts` (typed `ElectronBridge`, result unions such as `FileReadResult` / `FileWriteResult`) → `electron/preload.ts` → renderer wrapper `src/lib/electron.ts`. `getElectron()` returns `null` outside Electron, so renderer code must degrade gracefully. Handlers register via `ipc-safe-handle.ts` (never throws raw across the boundary).

## PTYs

`pty-manager.ts` owns `node-pty` and is the only spawner. Spawn requests are validated by the pure policy `src/shared/pty-spawn-policy.ts`: an allow-listed `agent` command or an explicit `shell: true` terminal; cwd must sit under a granted project root (`project-roots.ts`); `home: true` shells get `os.homedir()` substituted by the handler, not the renderer. Output is batched (`pty-output-batch.ts`) and sequenced. The API token reaches agent PTYs only through the curated `mcEnv` map (`pty-hook-env.ts`, `src/shared/mission-control-hook-env.ts`).

## Serving the app

- Dev: `scripts/dev-local.mjs` picks the first free port from 5173, sets `MC_USER_DATA_DIR=<repo>/.dev-userdata` and `MC_DEV_URL` / `MC_SERVER_ORIGIN`, then launches Electron against Vite.
- Prod: `server-runner.mjs` runs the bundled server resolved by `production-server-entry.ts` (ordered candidates covering `app.asar`, `resources/app`, legacy `dist-server`). Port chosen by `runtime-port.ts` (never the dev port), written to `$USER_DATA_DIR/.port`.

## Other subsystems

- **Sandboxes**: `sandbox-manager.ts` + `sandbox-{registry,store,settings,types,agent-client}.ts` — remote AWS VMs running `@agentsystemlabs/mission-control-agent`. Clone-error scrubbing and the SSH remote allow-list are duplicated in the agent repo — keep in sync (`docs/refactor-plan.md` §0.2).
- **File writes**: `open-path-policy.ts` marks auto-executing config paths (agent hooks, `.git/hooks`, `package.json`) as protected; `files:write` returns `protected-path` and the renderer retries `files:writeSensitive`, which shows a native confirm (`user-declined` is a normal outcome).
- **Installers**: `ensure-diagram-skill.ts`, `ensure-recall-skill.ts`, `ensure-recall-mcp.ts`, `agent-hooks.ts` write into the user's agent config; `agent-cli-*.ts` detect and update the CLIs.
- **Updater**: `update-manager.ts` is disabled in this fork (`updatesDisabled`, no `publish` feed, update UI and release poll removed). It short-circuits on a flag rather than being deleted so upstream stays mergeable; see [release.md](release.md).
- Misc: `whisper-server.ts` (local push-to-talk), `focus-mode.ts`, `session-finish-notification.ts`, `preview-server.ts`, `shell-env.ts`, `windows-cmd.ts`.
