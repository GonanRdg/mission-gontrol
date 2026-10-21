import { describe, expect, it } from "vitest";
import { gitKeys } from "../git";

describe("git query keys", () => {
  it("include the selected worktree id", () => {
    expect(gitKeys.status("project-1", "worktree-1")).toEqual([
      "projects",
      "project-1",
      "worktrees",
      "worktree-1",
      "git",
      "status",
    ]);
  });

  it("use main for the built-in worktree scope", () => {
    expect(gitKeys.all("project-1", null)).toEqual([
      "projects",
      "project-1",
      "worktrees",
      "main",
      "git",
    ]);
  });

  it("shares repository PR results across branch changes and scopes them to the checkout", () => {
    expect(gitKeys.pullRequests("project-1", null)).toEqual([
      "projects", "project-1", "worktrees", "main", "git", "pull-requests",
    ]);
    expect(gitKeys.pullRequests("project-1", "worktree-1")).not.toEqual(gitKeys.pullRequests("project-1", null));
  });
});
