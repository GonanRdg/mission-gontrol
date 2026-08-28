import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Release cadence (see .github/workflows/auto-tag-release.yml): every green push
// to main gets `npm version patch`, a `chore(release): vX.Y.Z` commit and a v*
// tag. So package.json on main always holds the *last released* version, and the
// next release from any work in progress is its patch successor.
//
// A build installed straight onto this machine is therefore named after the
// release it is on the way to, marked as a local prerelease of it:
//
//   0.49.1-local.22.g1a2b3c4          22 commits past v0.49.0, at 1a2b3c4
//   0.49.1-local.22.g1a2b3c4.dirty    …with uncommitted changes in the tree
//
// Ordering is honest in both directions: it sorts above the release it was cut
// from, and below the release that supersedes it. The `-local.` marker is what
// switches the auto-updater off (electron/update-manager.ts) so a published
// build never silently replaces one of these.

const RELEASE_COMMIT_GREP = "^chore(release): v";

function git(repoRoot, argv) {
  const res = spawnSync("git", argv, { cwd: repoRoot, encoding: "utf8" });
  if (res.status !== 0) return null;
  return res.stdout.trim();
}

/** `0.49.0` → `0.49.1`. Throws on anything that isn't a plain X.Y.Z. */
export function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`not a plain X.Y.Z version: ${version}`);
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

/**
 * Version to stamp on a locally installed build, plus the parts it was derived
 * from (for logging).
 */
export function localBuildVersion(repoRoot) {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const lastRelease = pkg.version;
  const target = nextPatch(lastRelease);

  const releaseCommit = git(repoRoot, ["log", "-1", "--format=%H", "--grep", RELEASE_COMMIT_GREP]);
  const aheadRaw = releaseCommit
    ? git(repoRoot, ["rev-list", "--count", `${releaseCommit}..HEAD`])
    : null;
  const ahead = Number.parseInt(aheadRaw ?? "", 10);
  const sha = git(repoRoot, ["rev-parse", "--short=7", "HEAD"]);
  const dirty = Boolean(git(repoRoot, ["status", "--porcelain"]));

  const identifiers = ["local", String(Number.isFinite(ahead) ? ahead : 0)];
  if (sha) identifiers.push(`g${sha}`);
  if (dirty) identifiers.push("dirty");

  return {
    version: `${target}-${identifiers.join(".")}`,
    lastRelease,
    target,
    ahead: Number.isFinite(ahead) ? ahead : null,
    sha,
    dirty,
  };
}
