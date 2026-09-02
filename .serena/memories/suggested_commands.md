# Commands (macOS / Darwin)

```bash
pnpm install              # postinstall rebuilds native deps for Electron
pnpm dev                  # = dev:electron → scripts/dev-local.mjs (Vite + Electron)
pnpm typecheck            # generates routeTree, then tsc for src and electron
pnpm lint                 # eslint src electron scripts *.config.ts
pnpm test                 # native:node + vitest run
pnpm scan:secrets         # regex secret scan (CI gate)
pnpm build                # web (vite + copy bundled skills) + electron tsc
pnpm dist:mac             # package for THIS machine's arch, --publish never
pnpm dist:mac:x64         # cross-package for Intel — see mem:packaging/macos
pnpm install:local        # build + swap into /Applications (survives replacing a running app)
pnpm rebuild              # native deps → Electron ABI (before packaging)
pnpm db:generate | db:push   # drizzle-kit, dev diffing only
pnpm setup:whisper        # fetch bundled whisper resources (needed for packaging)
pnpm remote-vm deploy aws --name x   # provision sandbox VM (docs/remote-vm-cli.md)
```

- Single test file: `pnpm test <path-substring>` (vitest include = `src/**/*.test.ts` + `electron/**/*.test.ts`, node environment, no jsdom).
- Dev isolation: `dev-local.mjs` sets `MC_USER_DATA_DIR=<repo>/.dev-userdata` and picks the first free port from 5173 — dev never touches the installed app's DB. Override with `MC_USER_DATA_DIR`.
- Real app state (Darwin): `~/Library/Application Support/MissionControl/` → `missioncontrol.db` (0600), `.port`, `skills/`.
- Don't invoke `vitest`/`tsc`/`electron` bare — the `pre*` Node-24 guard is what keeps native bindings matching. If `require('better-sqlite3')` starts throwing after packaging, an `--x64` build replaced the Node binding: `pnpm native:node` restores it (`mem:packaging/macos`).
- `src/server/services/__tests__/{git-repository,worktrees}.test.ts` are flaky under full-suite parallel load (they pass in isolation) — check a baseline before blaming a change for them.
