# Local build, install, and release commands (macOS)

Run from the repository root with Node 24 and the pinned pnpm.

## Deploy the current checkout to this Mac

```bash
pnpm install:local
```

This is the canonical local deployment command (`scripts/install-local.mjs`). It:

- builds only the selected/current host architecture as an unpacked `.app` using `electron-builder --dir --publish never`; it does not create a DMG, tag, push, or publish;
- stamps a traceable local version such as `YYYY.M.D-local.<ahead>.g<sha>[.dirty]` without editing `package.json`;
- stages and atomically swaps the bundle into `/Applications/MissionControl.app`;
- moves the previous app to `~/.Trash/MissionControl-<old-version>-<timestamp>.app`;
- ad-hoc re-signs/verifies the bundle and resets the stale Screen Recording grant.

A running MissionControl process keeps the old executable. Fully quit with Cmd+Q and relaunch after installation; grant Screen Recording again on the next capture.

Supported options:

```bash
pnpm install:local --skip-build
pnpm install:local --arch arm64
pnpm install:local --arch x64
pnpm install:local --app /custom/MissionControl.app --backup-dir /custom/backup
pnpm install:local --no-resign
```

Use `--skip-build` only when the matching unpacked app already exists in `dist-electron-out/mac-<arch>/MissionControl.app`.

## Build distributable macOS artifacts without publishing

```bash
pnpm dist:mac       # current machine architecture
pnpm dist:mac:x64   # Intel cross-build; also restores the local Node sqlite binding
```

These create DMGs under `dist-electron-out/` with `--publish never`. The x64 DMG may omit the architecture suffix; see `mem:packaging/macos` for naming and verification rules.

## Publish through the local release orchestrator

```bash
MISSION_CONTROL_RELEASE_TOKEN=... \
ACADEMY_BASE_URL=https://agentsystem.dev \
pnpm release:local --version vYYYY.M.D \
  --platforms mac-arm64,mac-x64 \
  --notes-file path/to/notes.md
```

`pnpm release:local` (`scripts/release-local.mjs`) is an external publication command, not a local app install. It prepares the release, builds/stages each requested platform, uploads artifacts and macOS update metadata to the Academy API, then finalizes the release. It requires the token and base URL, either in the environment or `.env.release`. On macOS the default platforms are `mac-arm64,mac-x64`; default version is `v` plus `package.json`'s version. `--skip-build` reuses existing artifacts.

It does not install `/Applications/MissionControl.app`. Use `pnpm install:local` for that.

This fork's public GitHub release flow is separate and manual: build both DMGs, tag the exact built commit, push the tag, then use `gh release create`; see `mem:release`.
