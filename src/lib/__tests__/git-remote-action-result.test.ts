import { describe, expect, it } from "vitest";
import { ApiError } from "~/lib/api";
import {
  describeGitRemoteFailure,
  describeGitRemoteOutcome,
  gitRemoteActionButtonState,
  outputTail,
  parseGitApiError,
  shouldRecordInBell,
} from "~/lib/git-remote-action-result";

const gitApiError = (error: string, stderr?: string) =>
  new ApiError(error, 400, stderr === undefined ? { error } : { error, stderr });

describe("describeGitRemoteOutcome", () => {
  it("reports a fetch with the last output line", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "fetch", result: { kind: "fetched", output: "From github.com:me/repo\n + abc..def main -> origin/main" } },
      "main",
    );
    expect(outcome).toMatchObject({
      action: "fetch",
      resultKind: "fetched",
      tone: "success",
      title: "Fetched origin · main",
      detail: " + abc..def main -> origin/main",
    });
    expect(outcome.durationMs).toBeGreaterThan(0);
  });

  it("falls back to a fixed detail when fetch printed nothing", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "fetch", result: { kind: "fetched", output: "  \n\n" } },
      "main",
    );
    expect(outcome.detail).toBe("Remote refs up to date.");
  });

  it("labels a fast-forward pull without a mode suffix", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "pull", mode: "ff-only", result: { kind: "pulled", output: "Fast-forward\n 2 files changed" } },
      "feature/x",
    );
    expect(outcome.title).toBe("Pulled feature/x");
    expect(outcome.detail).toBe(" 2 files changed");
    expect(outcome.mode).toBe("ff-only");
  });

  it("names the strategy for rebase and merge pulls", () => {
    expect(
      describeGitRemoteOutcome(
        { action: "pull", mode: "rebase", result: { kind: "pulled", output: "ok" } },
        "main",
      ).title,
    ).toBe("Pulled main (rebase)");
    expect(
      describeGitRemoteOutcome(
        { action: "pull", mode: "merge", result: { kind: "pulled", output: "ok" } },
        "main",
      ).title,
    ).toBe("Pulled main (merge)");
  });

  it("reports an already-up-to-date pull as a short success", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "pull", mode: "ff-only", result: { kind: "already-up-to-date", output: "Already up to date." } },
      "main",
    );
    expect(outcome).toMatchObject({
      resultKind: "already-up-to-date",
      tone: "success",
      title: "Already up to date",
      detail: "main matches origin.",
    });
  });

  it("reports a plain push", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "push", result: { kind: "pushed", setUpstream: false, output: "To github.com\n   abc..def  main -> main" } },
      "main",
    );
    expect(outcome.title).toBe("Pushed main");
    expect(outcome.detail).toBe("   abc..def  main -> main");
  });

  it("calls out the upstream when push set one", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "push", result: { kind: "pushed", setUpstream: true, output: "branch 'x' set up to track" } },
      "x",
    );
    expect(outcome.title).toBe("Pushed x — upstream set");
    expect(outcome.detail).toBe("Now tracking origin/x.");
  });

  it("reports nothing-to-push", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "push", result: { kind: "nothing-to-push" } },
      "main",
    );
    expect(outcome).toMatchObject({
      resultKind: "nothing-to-push",
      tone: "success",
      title: "Nothing to push",
      detail: "main is already up to date with origin.",
    });
  });

  it("falls back to HEAD when the branch is unknown", () => {
    expect(
      describeGitRemoteOutcome({ action: "fetch", result: { kind: "fetched", output: "" } }, null).title,
    ).toBe("Fetched origin · HEAD");
    expect(
      describeGitRemoteOutcome({ action: "fetch", result: { kind: "fetched", output: "" } }, "  ").title,
    ).toBe("Fetched origin · HEAD");
  });

  it("keeps every success detail on a single line", () => {
    const outcome = describeGitRemoteOutcome(
      { action: "pull", mode: "ff-only", result: { kind: "pulled", output: "line one\nline two\nline three" } },
      "main",
    );
    expect(outcome.detail).not.toContain("\n");
  });
});

describe("describeGitRemoteFailure", () => {
  it("is sticky and carries message plus stderr", () => {
    const outcome = describeGitRemoteFailure(
      "pull",
      gitApiError(
        "Branch has diverged from remote — use Pull with rebase or Pull with merge.",
        "fatal: Not possible to fast-forward, aborting.",
      ),
      { mode: "ff-only" },
    );
    expect(outcome.tone).toBe("error");
    expect(outcome.durationMs).toBeNull();
    expect(outcome.title).toBe("Pull failed");
    expect(outcome.detail).toContain("Branch has diverged from remote");
    expect(outcome.detail).toContain("Not possible to fast-forward");
    expect(outcome.mode).toBe("ff-only");
  });

  it("does not repeat stderr when it duplicates the message", () => {
    const outcome = describeGitRemoteFailure("push", gitApiError("git push failed", "git push failed"));
    expect(outcome.detail).toBe("git push failed");
  });

  it("titles each action", () => {
    expect(describeGitRemoteFailure("fetch", gitApiError("x")).title).toBe("Fetch failed");
    expect(describeGitRemoteFailure("push", gitApiError("x")).title).toBe("Push failed");
  });

  it("keeps a plain Error message (network failure, no response body)", () => {
    const outcome = describeGitRemoteFailure("fetch", new Error("Failed to fetch"));
    expect(outcome.detail).toBe("Failed to fetch");
    expect(outcome.tone).toBe("error");
  });

  it("falls back to the ApiError message when the body is not an object", () => {
    const outcome = describeGitRemoteFailure("push", new ApiError("500 Internal Server Error", 500, "boom"));
    expect(outcome.detail).toBe("500 Internal Server Error");
  });

  it("caps a very long stderr", () => {
    const stderr = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
    const detail = describeGitRemoteFailure("pull", gitApiError("git pull failed", stderr)).detail;
    expect(detail).toContain("line 59");
    expect(detail).not.toContain("line 0\n");
    expect(detail.split("\n").length).toBeLessThanOrEqual(22);
  });
});

describe("parseGitApiError", () => {
  it("prefers the body error over the HTTP status message", () => {
    expect(parseGitApiError(new ApiError("400 Bad Request", 400, { error: "no upstream" }))).toEqual({
      message: "no upstream",
      stderr: undefined,
      kind: undefined,
      worktreeId: undefined,
    });
  });

  it("passes through kind and worktreeId when present", () => {
    const parsed = parseGitApiError(
      new ApiError("400", 400, { error: "in use", kind: "branch-in-worktree", worktreeId: "wt1" }),
    );
    expect(parsed.kind).toBe("branch-in-worktree");
    expect(parsed.worktreeId).toBe("wt1");
  });

  it("stringifies a non-Error throw", () => {
    expect(parseGitApiError("boom").message).toBe("boom");
  });
});

describe("shouldRecordInBell", () => {
  const outcome = (call: Parameters<typeof describeGitRemoteOutcome>[0]) =>
    describeGitRemoteOutcome(call, "main");

  it("records every failure", () => {
    expect(shouldRecordInBell(describeGitRemoteFailure("fetch", gitApiError("x")))).toBe(true);
    expect(shouldRecordInBell(describeGitRemoteFailure("pull", gitApiError("x")))).toBe(true);
    expect(shouldRecordInBell(describeGitRemoteFailure("push", gitApiError("x")))).toBe(true);
  });

  it("records the successes that moved commits", () => {
    expect(
      shouldRecordInBell(outcome({ action: "pull", mode: "ff-only", result: { kind: "pulled", output: "" } })),
    ).toBe(true);
    expect(
      shouldRecordInBell(outcome({ action: "push", result: { kind: "pushed", setUpstream: false, output: "" } })),
    ).toBe(true);
  });

  it("skips no-op successes", () => {
    expect(shouldRecordInBell(outcome({ action: "fetch", result: { kind: "fetched", output: "" } }))).toBe(
      false,
    );
    expect(
      shouldRecordInBell(
        outcome({ action: "pull", mode: "ff-only", result: { kind: "already-up-to-date", output: "" } }),
      ),
    ).toBe(false);
    expect(shouldRecordInBell(outcome({ action: "push", result: { kind: "nothing-to-push" } }))).toBe(false);
  });
});

describe("outputTail", () => {
  it("drops blank lines and keeps the last N in order", () => {
    expect(outputTail("a\n\nb\n\nc\n", 2)).toBe("b\nc");
  });

  it("handles empty and non-positive input", () => {
    expect(outputTail("", 3)).toBe("");
    expect(outputTail(null, 3)).toBe("");
    expect(outputTail("a\nb", 0)).toBe("");
  });
});

describe("gitRemoteActionButtonState", () => {
  const base = { enabled: true, aheadCount: 0, behindCount: 0 } as const;

  it("enables an idle button with a plain tooltip", () => {
    expect(gitRemoteActionButtonState({ ...base, action: "fetch" })).toEqual({
      disabled: false,
      tooltip: "Fetch from origin",
      ariaLabel: "Fetch from origin",
    });
  });

  it("puts behind/ahead counts in the pull and push tooltips", () => {
    expect(
      gitRemoteActionButtonState({ ...base, action: "pull", behindCount: 2 }).tooltip,
    ).toBe("Pull — 2 commits behind");
    expect(gitRemoteActionButtonState({ ...base, action: "pull", behindCount: 1 }).tooltip).toBe(
      "Pull — 1 commit behind",
    );
    expect(gitRemoteActionButtonState({ ...base, action: "push", aheadCount: 3 }).tooltip).toBe(
      "Push — 3 commits ahead",
    );
  });

  it("ignores counts on the action they don't belong to", () => {
    expect(gitRemoteActionButtonState({ ...base, action: "fetch", behindCount: 5 }).tooltip).toBe(
      "Fetch from origin",
    );
    expect(gitRemoteActionButtonState({ ...base, action: "push", behindCount: 5 }).tooltip).toBe(
      "Push to origin",
    );
  });

  it("disables the running action with a progress tooltip", () => {
    expect(gitRemoteActionButtonState({ ...base, action: "pull", busyAction: "pull" })).toEqual({
      disabled: true,
      tooltip: "Pulling…",
      ariaLabel: "Pull from origin",
    });
  });

  it("disables the other actions while one is running", () => {
    const state = gitRemoteActionButtonState({ ...base, action: "fetch", busyAction: "push" });
    expect(state.disabled).toBe(true);
    expect(state.tooltip).toBe("Pushing…");
  });

  it("disables with the caller's reason when unavailable", () => {
    expect(
      gitRemoteActionButtonState({
        ...base,
        action: "push",
        enabled: false,
        disabledReason: "Fetch, Pull and Push aren't supported in sandbox sessions yet",
      }),
    ).toMatchObject({
      disabled: true,
      tooltip: "Fetch, Pull and Push aren't supported in sandbox sessions yet",
    });
  });

  it("still disables without a reason", () => {
    expect(gitRemoteActionButtonState({ ...base, action: "pull", enabled: false })).toMatchObject({
      disabled: true,
      tooltip: "Pull unavailable",
    });
  });
});
