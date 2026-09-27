---
name: release
description: Prepare and publish a Mission Gontrol desktop release from the intended stable branch, using local macOS builds and GitHub Releases.
---

# Mission Gontrol release

1. Read repository instructions. Verify branch, dirty state, remote main, and latest release. Preserve feature work in its checkout; prepare releases in a clean worktree from main.
2. Run typecheck, lint, tests, and rendered UI checks for changed behavior. Never bypass failed checks without explicit authorization.
3. Bump package.json with `pnpm version X.Y.Z --no-git-tag-version`. Match the annotated tag exactly to that version and the built commit.
4. Build Intel with `pnpm dist:mac:x64`, then Apple Silicon with `pnpm dist:mac`. Stage the Whisper binary/model before packaging.
5. Inspect both DMGs: version, app name, bundle ID, executable architecture, signature, native SQLite bindings, and Whisper resources.
6. Prepare release notes and obtain required publication confirmation under repository instructions. Push only the reviewed release commit/tag and publish both DMGs to this repository with GitHub Releases.
7. Verify remote commit/tag and uploaded assets. Existing users update manually; there is no upstream Academy or auto-update feed.

Never publish feature-branch work by accident, force-move a published tag, or invoke upstream Academy publication scripts.
