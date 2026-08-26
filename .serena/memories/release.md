# Release / shipping

Default path is automatic: any push to `main` triggers `.github/workflows/auto-tag-release.yml`, which patch-bumps `package.json`, commits `chore(release): vX.Y.Z`, pushes an annotated `vX.Y.Z` tag, then starts `release.yml` via `workflow_dispatch` (GITHUB_TOKEN pushes don't trigger workflows). Skipped when the head commit starts with `chore(release): v` or contains `[skip release]`.

Rules that bite:
1. `package.json` version and the tag (minus `v`) must be identical on the tagged commit. Bump with `pnpm version X.Y.Z --no-git-tag-version` **before** tagging.
2. Never reuse or force-move a remote tag — bump to the next patch instead (v0.47.1 incident).
3. Tag push → signed mac/win/linux installers attached to the **GitHub Release** + academy assets uploaded + the academy row *finalized*. That is download-only.
4. **In-app updates / electron-updater only advance after a manual Approve on agentsystem.dev.** Admin "Waiting" = finalize hasn't landed.
5. PR CI builds an unsigned Linux AppImage artifact for smoke-testing only.

Manual releases (major/minor, hotfix, or after `[skip release]`) follow `.agents/skills/release/SKILL.md` + `references/mission-control-release.md`. Changelog is `CHANGELOG.md`, newest-first emoji bullets (✨ feature, 🐛 fix).
