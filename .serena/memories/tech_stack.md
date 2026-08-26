# Tech stack (pins matter)

- **Node 24** (`.nvmrc` 24, `engines >=24 <25`), enforced by `scripts/require-node-24.mjs` wired as `pre*` for almost every script. **pnpm 11.1.2** via corepack (`packageManager` field); CI uses `--frozen-lockfile`.
- Dependencies are pinned **exact** (`savePrefix: ""` in `pnpm-workspace.yaml`); that file also holds security `overrides` (audit gate) and `allowBuilds`.
- Electron 41 · TypeScript 6.0 (`strict`, `noEmit`, moduleResolution Bundler) · React 19.2 · Vite 8 · Tailwind 4 (`@tailwindcss/vite`, no config file) · eslint 10 flat config.
- TanStack: Start (SSR + file routes) + Router 1.169 + React Query 5. Zod 4 for all input validation.
- Data: `better-sqlite3` 12 + `drizzle-orm` 0.45 (+ `drizzle-kit` dev only).
- Terminals: `node-pty` 1.2 beta + `@xterm/xterm` 6 (webgl/fit/web-links addons).
- Also: CodeMirror 6 (file editor), `mermaid` (diagram viewer), `web-tree-sitter` + `@vscode/tree-sitter-wasm` (code graph index), bundled whisper.cpp (local push-to-talk), `@modelcontextprotocol/sdk` (bundled MCP), `@agentsystemlabs/mission-control-agent` (remote VM agent).

## Native-module ABI split (frequent source of breakage)

- `better-sqlite3` is loaded by **both** the Node-hosted dev/test/drizzle server and packaged Electron → `scripts/ensure-node-sqlite.mjs` / `ensure-electron-sqlite.mjs` swap the prebuilt binding; `src/db/better-sqlite3-native-binding.ts` resolves it at runtime.
- `node-pty` runs **only** inside Electron (`postinstall` rebuilds for Electron).
- `pnpm rebuild` = both rebuilt for Electron (do before packaging); `pnpm native:node` = back to Node ABI (test/dev/db scripts do it themselves).
- Vite keeps `better-sqlite3`, `node-pty`, `web-tree-sitter` out of the bundle (`optimizeDeps.exclude` + `ssr.external`).
- `@codemirror/state|view|language` are deduped/pinned — duplicate copies break `instanceof` and crash the file editor.
