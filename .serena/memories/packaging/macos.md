# macOS packaging (fork)

Applies to local/fork builds. Upstream's signed+notarized CI path is `mem:release`.

## Arch: the one thing that breaks Intel builds

`src/db/better-sqlite3-native-binding.ts` resolves the binding at RUNTIME from `process.arch`:

    better-sqlite3/bin/<platform>-<process.arch>-<process.versions.modules>/better-sqlite3.node

and **throws when absent — it does not fall back to `build/Release`.** `pnpm native:electron:sqlite` only ever stages the arch of the Electron on this machine. So packaging `--mac --x64` from Apple Silicon ships `bin/darwin-arm64-<abi>/` alone and dies at DB init on Intel, even though electron-builder put a correct x86_64 binary in `build/Release`.

- Fix: `pnpm dist:mac:x64` → stages the other arch via `scripts/stage-electron-sqlite-arch.mjs` (downloads better-sqlite3's published prebuild for the Electron ABI; no compiler, no Rosetta, no Intel hardware), then packages, then restores the Node binding.
- Staging is additive — both `bin/darwin-{arm64,x64}-<abi>/` coexist and every build carries both, so one artifact works wherever it lands.
- **node-pty needs no equivalent**: plain `require("node-pty")`, its own loader picks `prebuilds/darwin-<arch>/` at runtime and the package ships both.
- Universal (`--universal`) is NOT a shortcut around this: it merges an x64 app with an arm64 app, so it needs the x64 natives working first.

**`electron-builder --mac --x64` overwrites `build/Release/better_sqlite3.node` with an x86_64 binary**, silently breaking local Node tests (`require('better-sqlite3')` throws). `dist:mac:x64` ends with `pnpm native:node` to restore it; run that by hand after any manual x64 packaging.

## Signing: "damaged" vs "unidentified developer"

Electron's prebuilt binary arrives linker-signed ad-hoc. If electron-builder writes into the bundle without re-signing, the seal no longer matches:

    spctl: code has no resources but signature indicates they must be present

That is the **"MissionControl is damaged and can't be opened"** dialog — a dead end, since macOS offers no override for a damaged app (no "Open Anyway" in Privacy & Security; only `xattr -dr com.apple.quarantine` gets in).

Re-sealing the whole bundle ad-hoc makes the signature valid but anonymous → Gatekeeper reports plain `rejected` = unidentified developer → **"Open Anyway" appears**. This is the difference users actually feel; keep it.

- `scripts/afterpack-adhoc-sign.mjs` (electron-builder `afterPack`) re-signs before the dmg is built from the app, and **fails the build if the seal does not verify** — the broken signature shipped precisely because packaging succeeded and the fault only appeared on someone else's Mac.
- `mac.identity: null` so electron-builder deterministically skips its own signing rather than leaving a stale seal; `mac.notarize: false` because the fork has no credentials. With a real Developer ID, restore both and drop the hook.
- Verify artifacts by mounting the dmg, not the build dir: `codesign --verify --deep --strict` (silence = valid) and `spctl -a -t exec -vv`.

## Toolchain

Node 24 + pnpm are required (`engines`, `pre*` hooks; `better-sqlite3` is compiled against ABI 137). Node 26 fails the gate and the natives error with `NODE_MODULE_VERSION`.
