import { describe, expect, it } from "vitest";
import { ApiError } from "~/lib/api";
import {
  buildGitHandoffPrompt,
  gitHandoffFailureFromOutcome,
} from "~/lib/git-handoff-prompt";
import { describeGitRemoteFailure } from "~/lib/git-remote-action-result";
import { DEFAULT_GIT_HANDOFF_PROMPT } from "~/shared/git-handoff-defaults";

const instruction = "Fix my git.";

describe("buildGitHandoffPrompt", () => {
  it("leads with the instruction and states the situation", () => {
    const prompt = buildGitHandoffPrompt({
      instruction,
      projectName: "mission-control",
      branch: "main",
      failure: {
        action: "pull",
        mode: "ff-only",
        message: "Branch has diverged from remote",
        stderr: "fatal: Not possible to fast-forward, aborting.",
      },
    });

    expect(prompt.startsWith(instruction)).toBe(true);
    expect(prompt).toContain("- Project: mission-control");
    expect(prompt).toContain("- Branch: main");
    expect(prompt).toContain("- Failed command: git pull (ff-only)");
    expect(prompt).toContain("- Error: Branch has diverged from remote");
    expect(prompt).toContain("fatal: Not possible to fast-forward");
  });

  it("omits the mode for actions that have none", () => {
    const prompt = buildGitHandoffPrompt({
      instruction,
      projectName: "app",
      branch: "feature",
      failure: { action: "push", message: "git push failed" },
    });

    expect(prompt).toContain("- Failed command: git push");
    expect(prompt).not.toContain("(undefined)");
  });

  it("names the worktree when the action ran in one", () => {
    const prompt = buildGitHandoffPrompt({
      instruction,
      projectName: "app",
      branch: "feature",
      worktreeName: "wt-refactor",
      failure: { action: "pull", message: "boom" },
    });

    expect(prompt).toContain("- Worktree: wt-refactor");
  });

  it("says so when nothing has failed yet", () => {
    const prompt = buildGitHandoffPrompt({
      instruction,
      projectName: "app",
      branch: "main",
    });

    expect(prompt).toContain("No command has failed");
    expect(prompt).not.toContain("Failed command");
  });

  it("falls back to unknown for a missing branch", () => {
    expect(
      buildGitHandoffPrompt({ instruction, projectName: "app", branch: null }),
    ).toContain("- Branch: unknown");
  });

  it("caps a huge stderr", () => {
    const stderr = Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n");
    const prompt = buildGitHandoffPrompt({
      instruction,
      projectName: "app",
      branch: "main",
      failure: { action: "pull", message: "boom", stderr },
    });

    expect(prompt).toContain("line 79");
    expect(prompt).not.toContain("line 10\n");
  });
});

describe("gitHandoffFailureFromOutcome", () => {
  it("splits a failure outcome back into message and stderr", () => {
    const outcome = describeGitRemoteFailure(
      "pull",
      new ApiError("400", 400, {
        error: "Pull hit conflicts",
        stderr: "CONFLICT (content): Merge conflict in src/app.ts",
      }),
      { mode: "rebase" },
    );

    expect(gitHandoffFailureFromOutcome(outcome)).toEqual({
      action: "pull",
      mode: "rebase",
      message: "Pull hit conflicts",
      stderr: "CONFLICT (content): Merge conflict in src/app.ts",
    });
  });

  it("handles a failure with no stderr", () => {
    const outcome = describeGitRemoteFailure("push", new Error("Failed to fetch"));

    expect(gitHandoffFailureFromOutcome(outcome)).toEqual({
      action: "push",
      message: "Failed to fetch",
    });
  });

  it("round-trips into a prompt with the default instruction", () => {
    const outcome = describeGitRemoteFailure(
      "push",
      new ApiError("400", 400, { error: "rejected", stderr: "non-fast-forward" }),
    );
    const prompt = buildGitHandoffPrompt({
      instruction: DEFAULT_GIT_HANDOFF_PROMPT,
      projectName: "app",
      branch: "main",
      failure: gitHandoffFailureFromOutcome(outcome),
    });

    expect(prompt).toContain("- Error: rejected");
    expect(prompt).toContain("non-fast-forward");
  });
});
