# Release / shipping

**This fork does not use the upstream release pipeline.** Read which situation you are in first.

## This fork (GonanRdg/mission-control) — current reality

Public fork of `AgentSystemLabs/mission-control`, MIT, original copyright preserved with the fork's added beside it (LICENSE, README, Settings → About).

- **GitHub Actions is disabled** (workflows registered, 0 runs). Keep it that way: `auto-tag-release.yml` fires on every push to `main` and `release.yml` is wired to upstream's academy + Apple signing secrets, so enabling it produces failing runs and unwanted auto-tags.
- Releases are **built locally and published by hand**: build, `git tag -a vX && git push origin vX`, `gh release create`. Packaging rules (arch, signing, what breaks Intel) are `mem:packaging/macos` — read it before cutting one.
- Builds are **unsigned/not notarized**; release notes must carry the Gatekeeper step.
- Versioning is **calver `YYYY.M.D`** — upstream lives in `0.x` and patch-bumps on every merge, so a dated version cannot collide and reads as a fork build. Must stay a plain `X.Y.Z`: `scripts/lib/build-version.mjs` `nextPatch()` rejects anything else, so no `-fork.1` suffixes.
- **Auto-update is removed**, not merely disabled: no `publish` block, `updatesDisabled` in `electron/update-manager.ts`, the release poll is inert and the update UI is gone. The upstream feed belongs to a server this repo does not own; anything published there outranks a fork build and would silently replace it. Wiring short-circuits on a flag rather than being deleted, so upstream stays mergeable.
- `gh` may be authenticated as a different account than the repo owner; its failure mode is a misleading *"workflow scope may be required"*. The remote URL carries a PAT that can be passed as `GH_TOKEN` as a fallback.
- Artifacts are frozen at build time — a commit made after packaging is **not** in the dmg. Tag the commit you actually built, or the tag cannot reproduce the release.

## Upstream (for merges / historical context)

Push to `main` → `auto-tag-release.yml` patch-bumps `package.json`, commits `chore(release): vX.Y.Z`, pushes the tag, dispatches `release.yml` (GITHUB_TOKEN pushes don't trigger workflows). Skipped when the head commit starts with `chore(release): v` or contains `[skip release]`.

Rules that bite there:
1. `package.json` version and the tag (minus `v`) must match on the tagged commit.
2. Never reuse or force-move a remote tag — bump instead (v0.47.1 incident).
3. Tag push → signed installers on the GitHub Release + academy assets + academy row finalized. Download-only.
4. In-app updates only advance after a manual Approve on agentsystem.dev.

Manual upstream releases follow `.agents/skills/release/SKILL.md` + `references/mission-control-release.md`. Changelog is `CHANGELOG.md`, newest-first emoji bullets (✨ feature, 🐛 fix).
