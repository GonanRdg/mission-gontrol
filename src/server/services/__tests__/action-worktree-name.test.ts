import { describe, expect, it, vi } from "vitest";
import {
  generateActionWorktreeName,
  sanitizeActionWorktreeName,
} from "../action-worktree-name";

describe("action worktree name generation", () => {
  it("sanitizes a model response to an action-prefixed 2-5 segment name", () => {
    expect(sanitizeActionWorktreeName("Feature: Dark mode launch!", "implement")).toBe(
      "implement-dark-mode-launch",
    );
    expect(sanitizeActionWorktreeName("IMPLEMENT quick fix", "implement")).toBe(
      "implement-quick-fix",
    );
    expect(sanitizeActionWorktreeName("```\n---\n```", "implement")).toBeNull();
  });

  it("uses the selected agent print mode and returns null when it fails", async () => {
    const run = vi.fn().mockResolvedValue("```text\nFast action forms\n```");
    await expect(
      generateActionWorktreeName(
        { agent: "codex", prefix: "implement", text: "Build action forms" },
        run,
      ),
    ).resolves.toBe("implement-fast-action-forms");
    expect(run).toHaveBeenCalledOnce();

    await expect(
      generateActionWorktreeName(
        { agent: "codex", prefix: "implement", text: "Build action forms" },
        vi.fn().mockRejectedValue(new Error("missing CLI")),
      ),
    ).resolves.toBeNull();
  });

  it("uses the safe print-mode fallback for Cursor", async () => {
    const run = vi.fn().mockResolvedValue("quick action form");

    await generateActionWorktreeName(
      { agent: "cursor-cli", prefix: "implement", text: "Build action forms" },
      run,
    );

    expect(run).toHaveBeenCalledWith("claude", expect.any(Array));
  });
});
