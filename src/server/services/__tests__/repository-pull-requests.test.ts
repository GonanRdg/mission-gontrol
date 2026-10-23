import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { getRepositoryPullRequests } from "../git";

const row = (number: number, branch: string, draft = false) => ({
  number, html_url: `https://github.com/fixture/repo/pull/${number}`, title: `Change ${number}`,
  draft, head: { ref: branch, repo: { html_url: "https://github.com/fixture/repo" } },
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cwd.mockReturnValue("/fixture/master");
  mocks.repo.mockReturnValue("https://github.com/fixture/repo");
});

describe("repository PR lookup", () => {
  it("includes drafts on other branches and every page without reading or changing the checkout", async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify([
      [row(211, "HOPS-3203", true)], [row(212, "other-worktree")],
    ]), stderr: "" });
    expect(await getRepositoryPullRequests("project", "worktree")).toEqual({
      repository: "https://github.com/fixture/repo",
      pullRequests: [
        { number: 211, url: "https://github.com/fixture/repo/pull/211", title: "Change 211", isDraft: true, headRefName: "HOPS-3203", headRepositoryUrl: "https://github.com/fixture/repo" },
        { number: 212, url: "https://github.com/fixture/repo/pull/212", title: "Change 212", isDraft: false, headRefName: "other-worktree", headRepositoryUrl: "https://github.com/fixture/repo" },
      ],
    });
    expect(mocks.cwd).toHaveBeenCalledWith("project", "worktree");
    expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith("gh", [
      "api", "--paginate", "--slurp", "repos/fixture/repo/pulls?state=open&per_page=100",
    ], expect.objectContaining({ cwd: "/fixture/master" }));
  });

  it("returns an empty list for a successful query with no open PRs", async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: "[[]]", stderr: "" });
    expect((await getRepositoryPullRequests("project")).pullRequests).toEqual([]);
  });

  it("accepts canonical API URLs when the configured remote has different casing", async () => {
    mocks.repo.mockReturnValue("https://github.com/Fixture/REPO");
    mocks.spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify([[row(211, "HOPS-3203", true)]]), stderr: "" });
    expect((await getRepositoryPullRequests("project")).pullRequests).toMatchObject([{ number: 211 }]);
  });

  it("retains fork PRs and PRs whose source repository is deleted", async () => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify([[
      { ...row(211, "master"), head: { ref: "master", repo: { html_url: "https://github.com/contributor/repo" } } },
      { ...row(212, "master"), head: { ref: "master", repo: null } },
    ]]), stderr: "" });
    expect((await getRepositoryPullRequests("project")).pullRequests).toMatchObject([
      { number: 211, headRefName: "master", headRepositoryUrl: "https://github.com/contributor/repo" },
      { number: 212, headRefName: "master", headRepositoryUrl: null },
    ]);
  });

  it("skips GitHub for a non-GitHub origin", async () => {
    mocks.repo.mockReturnValue(null);
    expect(await getRepositoryPullRequests("project")).toEqual({ repository: null, pullRequests: [] });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it.each([1, 4, 127])("rejects CLI failures instead of reporting no PRs (exit %s)", async (code) => {
    mocks.spawn.mockResolvedValue({ code, stdout: "", stderr: "private diagnostic" });
    await expect(getRepositoryPullRequests("project")).rejects.toThrow();
  });

  it.each([
    "invalid json", "{}", "[null]", "[[null]]",
    JSON.stringify([[{ ...row(1, "branch"), html_url: "https://github.com.evil.test/fixture/repo/pull/1" }]]),
    JSON.stringify([[{ ...row(1, "branch"), html_url: "https://github.com/other/repo/pull/1" }]]),
    JSON.stringify([[{ ...row(1, "branch"), head: null }]]),
    JSON.stringify([[{ ...row(1, "branch"), draft: "true" }]]),
  ])("rejects malformed or unsafe API responses (%s)", async (stdout) => {
    mocks.spawn.mockResolvedValue({ code: 0, stdout, stderr: "" });
    await expect(getRepositoryPullRequests("project")).rejects.toThrow();
  });
});
