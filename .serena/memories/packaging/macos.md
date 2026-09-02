# macOS packaging (fork)

Applies to local/fork builds. Upstream's signed+notarized CI path is `mem:release`.

## Procedure: build both arches

Node 24 + pnpm on PATH first (see Toolchain). Run from a clean tree — an untracked file stamps the build `.dirty`.

```bash
# 1. version (calver YYYY.M.D, plain X.Y.Z — see mem:release), commit it
pnpm version 2026.9.4 --no-git-tag-version && git commit -am "..."

# 2. build. Order matters: dist:mac:x64 leaves node_modules staged for x64
pnpm dist:mac        # → dist-electron-out/MissionControl-<v>-arm64.dmg
pnpm dist:mac:x64    # → dist-electron-out/MissionControl-<v>.dmg   ← NO arch suffix

# 3. tag the commit that was actually built, then publish
git tag -a v<v> -m "..." && git push origin main v<v>
gh release create v<v> <arm64.dmg> <x64.dmg> --title "..." --notes-file <notes>
```

Gotchas that cost time:

- **The x64 dmg has no arch in its name** (electron-builder's default for x64): `MissionControl-<v>.dmg` next to `MissionControl-<v>-arm64.dmg`. Copy it to `-x64.dmg` before uploading or colleagues cannot tell them apart.
- `dist-electron-out/` is never cleaned — artifacts from older versions pile up. Upload by exact filename.
- Tag **after** building, on the built commit. Artifacts are frozen at build time; a later commit is not in them and a tag ahead of the build cannot reproduce it.
- Verify before publishing (below). Both dmgs must be mounted and checked — the failure modes here are invisible on the machine that built them.

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
## Verify an artifact before publishing

Check the dmg, not `dist-electron-out/mac*/` — the dmg is what people get.

```bash
MNT=$(hdiutil attach -nobrowse -readonly <dmg> | grep -o '/Volumes/.*'); APP="$MNT/MissionControl.app"
codesign --verify --deep --strict "$APP"      # SILENCE = valid seal
spctl -a -t exec -vv "$APP"                   # want plain "rejected"; anything
                                              # mentioning resources = broken seal
file -b "$APP/Contents/MacOS/MissionControl"  # x86_64 | arm64 — must match the dmg
ls "$APP/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/bin/"
                                              # must list BOTH darwin-arm64-* and darwin-x64-*
hdiutil detach "$MNT"
```

Both failure modes are invisible on the building machine: the wrong-arch binding only throws on the other CPU, and quarantine (which triggers the signature check) is only applied on download.


## Toolchain

Node 24 + pnpm are required (`engines`, `pre*` hooks; `better-sqlite3` is compiled against ABI 137). Node 26 fails the gate and the natives error with `NODE_MODULE_VERSION`.
