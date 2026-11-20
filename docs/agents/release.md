# Release and local install

This fork does not use the upstream release pipeline.

## This fork

- **GitHub Actions is disabled** (workflows registered, 0 runs). Keep it that way: `auto-tag-release.yml` fires on every push to `main` and `release.yml` is wired to upstream's academy and Apple signing secrets, so enabling Actions produces failing runs and unwanted auto-tags.
- Releases are **built locally and published by hand**: build, `git tag -a vX && git push origin vX`, `gh release create`. Packaging rules (arch, signing, what breaks Intel): [packaging-macos.md](packaging-macos.md).
- Builds are **unsigned and not notarized**; release notes must carry the Gatekeeper step.
- Versioning is **calver `YYYY.M.D`** — upstream lives in `0.x` and patch-bumps every merge, so a dated version cannot collide. Must stay plain `X.Y.Z`: `scripts/lib/build-version.mjs` `nextPatch()` rejects anything else.
- **Auto-update is removed**: no `publish` block, `updatesDisabled` in `electron/update-manager.ts`, release poll inert, update UI gone. The upstream feed belongs to a server this repo does not own; anything published there would outrank and silently replace a fork build. Wiring short-circuits on a flag so upstream stays mergeable.
- Keep remote URLs credential-free; authenticate `gh` via the system credential manager or an ephemeral `GH_TOKEN`.
- Artifacts are frozen at build time — tag the commit that was actually built.

## Install the current checkout on this Mac

```bash
pnpm install:local [--skip-build] [--arch arm64|x64] [--app <path>] [--backup-dir <dir>] [--no-resign]
```

`scripts/install-local.mjs`:
- builds the host arch as an unpacked `.app` (`electron-builder --dir --publish never`) — no DMG, tag, push or publish;
- stamps a traceable version `YYYY.M.D-local.<ahead>.g<sha>[.dirty]` without editing `package.json` (an untracked file makes it `.dirty`);
- stages and atomically swaps the bundle into `/Applications/Mission Gontrol.app` via two renames, so it is safe to run from a session inside the running app;
- moves the previous app to `~/.Trash/Mission Gontrol-<old-version>-<timestamp>.app`;
- ad-hoc re-signs, verifies, and resets the stale Screen Recording grant.

The running app keeps the old executable: quit with Cmd+Q and relaunch, then grant Screen Recording again on the next capture. `--skip-build` needs a matching unpacked app in `dist-electron-out/mac-<arch>/`.

## Upstream pipeline (merges and history only)

Push to `main` → `auto-tag-release.yml` patch-bumps `package.json`, commits `chore(release): vX.Y.Z`, pushes the tag, dispatches `release.yml`. Skipped when the head commit starts with `chore(release): v` or contains `[skip release]`. Never reuse or force-move a remote tag. In-app updates there only advance after a manual Approve on agentsystem.dev. `pnpm release:local` (`scripts/release-local.mjs`) publishes to that Academy API and needs `MISSION_CONTROL_RELEASE_TOKEN` + `ACADEMY_BASE_URL` — it is an external publication, not a local install. Manual upstream releases follow `.agents/skills/release/SKILL.md`.
