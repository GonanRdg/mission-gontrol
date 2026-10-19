import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), cwd: vi.fn(), repo: vi.fn() }));
vi.mock("../_spawn", () => ({ spawnCapture: mocks.spawn }));
vi.mock("../projects", () => ({ detectGithubUrl: mocks.repo }));
vi.mock("../worktrees", () => ({
  resolveProjectWorktreeCwd: mocks.cwd, canonicalPath: vi.fn(), gitWorktreeList: vi.fn(),
}));
vi.mock("../../repositories/projects.repo", () => ({ findProjectById: vi.fn() }));
vi.mock("../../repositories/worktrees.repo", () => ({ findWorktreesByProjectId: vi.fn() }));
vi.mock("../commit-cli", () => ({
  CommitMessageGenerationError: class extends Error {}, resolveCommitCli: vi.fn(), runCommitCli: vi.fn(),
}));

import { getBranchPullRequest } from "../git";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cwd.mockReturnValue("/fixture/worktree");
  mocks.repo.mockReturnValue("https://github.com/fixture/repo");
  mocks.spawn.mockResolvedValueOnce({ code: 0, stdout: "feature/pr-browser\n", stderr: "" });
});

describe("branch PR lookup", () => {
  it("finds a draft PR from a real linked worktree's shared origin", async () => {
    const { detectGithubUrl } = await vi.importActual<typeof import("../projects")>("../projects");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-linked-pr-"));
    const repo = path.join(root, "repo");
    const worktree = path.join(root, "linked worktree");
    fs.mkdirSync(repo);
    const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
    try {
      git(["init", "--initial-branch=main"]);
      git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "Fixture"]);
      git(["remote", "add", "origin", "git@github.com:fixture/repo.git"]);
      git(["worktree", "add", "-b", "feature/pr-browser", worktree]);
      mocks.cwd.mockReturnValue(worktree);
      mocks.repo.mockImplementation(detectGithubUrl);
      const pullRequest = { number: 1038, url: "https://github.com/fixture/repo/pull/1038", title: "Linked worktree", isDraft: true };
      mocks.spawn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify([pullRequest]), stderr: "" });

      expect(await getBranchPullRequest("project", "linked-worktree")).toEqual({ branch: "feature/pr-browser", pullRequest });
      expect(mocks.spawn).toHaveBeenLastCalledWith("gh", expect.arrayContaining(["--repo", "https://github.com/fixture/repo", "--head", "feature/pr-browser"]), expect.objectContaining({ cwd: worktree }));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("only reads the selected worktree and open PRs for its checked-out branch", async () => {
    const pullRequest = { number: 42, url: "https://github.com/fixture/repo/pull/42", title: "Browser", isDraft: true };
    mocks.spawn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify([pullRequest]), stderr: "" });
    expect(await getBranchPullRequest("project", "worktree")).toEqual({ branch: "feature/pr-browser", pullRequest });
    expect(mocks.cwd).toHaveBeenCalledWith("project", "worktree");
    expect(mocks.spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ["git", ["rev-parse", "--abbrev-ref", "HEAD"]],
      ["gh", ["pr", "list", "--repo", "https://github.com/fixture/repo", "--head", "feature/pr-browser",
        "--state", "open", "--limit", "1", "--json", "number,url,title,isDraft"]],
    ]);
    expect(mocks.spawn.mock.calls.every(([, , options]) => options.cwd === "/fixture/worktree")).toBe(true);
  });

  it("distinguishes a successful empty lookup from CLI failure", async () => {
    mocks.spawn.mockResolvedValueOnce({ code: 0, stdout: "[]", stderr: "" });
    expect(await getBranchPullRequest("project")).toEqual({ branch: "feature/pr-browser", pullRequest: null });
  });

  it.each([4, 127, 1])("reports lookup failure instead of claiming no PR exists (exit %s)", async (code) => {
    mocks.spawn.mockResolvedValueOnce({ code, stdout: "", stderr: "private diagnostic" });
    await expect(getBranchPullRequest("project")).rejects.toThrow();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("does not query GitHub for a non-GitHub repository", async () => {
    mocks.repo.mockReturnValue(null);
    expect((await getBranchPullRequest("project")).pullRequest).toBeNull();
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("does not query GitHub for detached HEAD", async () => {
    mocks.spawn.mockReset().mockResolvedValueOnce({ code: 0, stdout: "HEAD\n", stderr: "" });
    expect(await getBranchPullRequest("project")).toEqual({ branch: null, pullRequest: null });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe URLs returned by a lookup", async () => {
    mocks.spawn.mockResolvedValueOnce({ code: 0, stdout: JSON.stringify([
      { number: 42, url: "https://github.com.evil.test/fixture/repo/pull/42", title: "Browser", isDraft: false },
    ]), stderr: "" });
    await expect(getBranchPullRequest("project")).rejects.toThrow();
  });
});
