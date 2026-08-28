import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isNewerSemver } from "~/shared/semver";

// @ts-expect-error The build-version helper is a Node .mjs script; tests exercise its exports.
const buildVersion = await import("../../scripts/lib/build-version.mjs");

const { localBuildVersion, nextPatch } = buildVersion as {
  localBuildVersion: (repoRoot: string) => {
    version: string;
    lastRelease: string;
    target: string;
    ahead: number | null;
    sha: string | null;
    dirty: boolean;
  };
  nextPatch: (version: string) => string;
};

const tmpRepos: string[] = [];

function git(cwd: string, argv: string[]) {
  return execFileSync("git", argv, { cwd, encoding: "utf8" }).trim();
}

/** A repo that mirrors the real cadence: a `chore(release): vX.Y.Z` commit, then work on top. */
function makeRepo(version: string, commitsAfterRelease: number): string {
  const dir = mkdtempSync(join(tmpdir(), "mc-build-version-"));
  tmpRepos.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version }));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", `chore(release): v${version}`]);
  for (let i = 0; i < commitsAfterRelease; i++) {
    writeFileSync(join(dir, `f${i}.txt`), String(i));
    git(dir, ["add", "."]);
    git(dir, ["commit", "-q", "-m", `feat: change ${i}`]);
  }
  return dir;
}

type Stamp = ReturnType<typeof localBuildVersion>;

// Building the fixture repos costs a handful of `git` spawns each, which blows
// the default 5s test timeout when the whole suite runs in parallel. Build them
// once, then assert against the stamps.
let aheadOfRelease: Stamp;
let onReleaseCommit: Stamp;
let dirtyTree: Stamp;

beforeAll(() => {
  const repo = makeRepo("0.49.0", 3);
  aheadOfRelease = localBuildVersion(repo);
  onReleaseCommit = localBuildVersion(makeRepo("0.48.36", 0));
  writeFileSync(join(repo, "scratch.txt"), "wip");
  dirtyTree = localBuildVersion(repo);
}, 60_000);

afterAll(() => {
  for (const dir of tmpRepos) rmSync(dir, { recursive: true, force: true });
});

describe("nextPatch", () => {
  it("bumps the patch the way the release workflow does", () => {
    expect(nextPatch("0.49.0")).toBe("0.49.1");
    expect(nextPatch("0.48.36")).toBe("0.48.37");
    expect(nextPatch("1.0.9")).toBe("1.0.10");
  });

  it("rejects anything that is not a plain X.Y.Z", () => {
    expect(() => nextPatch("0.99")).toThrow();
    expect(() => nextPatch("0.49.1-local.2")).toThrow();
  });
});

describe("localBuildVersion", () => {
  it("names the build after the release it is on the way to", () => {
    expect(aheadOfRelease.lastRelease).toBe("0.49.0");
    expect(aheadOfRelease.target).toBe("0.49.1");
    expect(aheadOfRelease.ahead).toBe(3);
    expect(aheadOfRelease.dirty).toBe(false);
    expect(aheadOfRelease.version).toMatch(/^0\.49\.1-local\.3\.g[0-9a-f]{7}$/);
  });

  it("counts zero commits ahead on the release commit itself", () => {
    expect(onReleaseCommit.version).toMatch(/^0\.48\.37-local\.0\.g[0-9a-f]{7}$/);
  });

  it("marks an uncommitted tree", () => {
    expect(dirtyTree.dirty).toBe(true);
    expect(dirtyTree.version.endsWith(".dirty")).toBe(true);
  });

  it("keeps the academy update check quiet until upstream passes the target release", () => {
    // isNewerSemver compares numeric cores only, so a published 0.49.0 or
    // 0.49.1 does not read as an update over 0.49.1-local.N — 0.49.2 does.
    expect(isNewerSemver("0.49.0", aheadOfRelease.version)).toBe(false);
    expect(isNewerSemver("0.49.1", aheadOfRelease.version)).toBe(false);
    expect(isNewerSemver("0.49.2", aheadOfRelease.version)).toBe(true);
  });

  it("carries the `-local.<n>` prerelease the updater keys off", () => {
    // Full semver ranks a prerelease *below* the release of the same core, so
    // electron-updater would happily install a published 0.49.1 over this
    // build. update-manager reads this marker and never loads the updater.
    expect(/-local\.\d+/.test(aheadOfRelease.version)).toBe(true);
  });
});
