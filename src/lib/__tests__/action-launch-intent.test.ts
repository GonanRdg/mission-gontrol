import { describe, expect, it } from "vitest";
import {
  consumeActionLaunchIntent,
  markActionLaunchIntent,
  renderActionLaunchPrompt,
  type ActionLaunchIntent,
} from "../action-launch-intent";

const intent: ActionLaunchIntent = {
  actionName: "implement-feature",
  workflowSkill: "implement-ticket",
  agent: "codex",
  branch: "main",
  promptTemplate: "Implement {{worktree.branch}} for {{project.name}}.",
  promptContext: {
    project: { name: "Mission Control" },
    worktree: { branch: "generated-on-start" },
  },
  worktree: true,
  preferredWorktreeName: "implement-mc-1234",
  worktreeFreeText: null,
  worktreePrefix: "implement",
};

describe("action launch intent", () => {
  it("is consumed exactly once", () => {
    markActionLaunchIntent("project-1", intent);

    expect(consumeActionLaunchIntent("project-1")).toEqual(intent);
    expect(consumeActionLaunchIntent("project-1")).toBeNull();
  });

  it("keeps intents isolated by project", () => {
    markActionLaunchIntent("project-1", intent);

    expect(consumeActionLaunchIntent("project-2")).toBeNull();
    expect(consumeActionLaunchIntent("project-1")).toEqual(intent);
  });

  it("renders the submitted prompt with the created worktree branch", () => {
    expect(renderActionLaunchPrompt(intent, "implement-mc-1234")).toBe(
      "Implement implement-mc-1234 for Mission Control.",
    );
  });

  it("uses Codex skill mention syntax in the submitted prompt", () => {
    expect(
      renderActionLaunchPrompt(
        { ...intent, promptTemplate: "  /implement-ticket\nTicket: MC-123" },
        "implement-mc-123",
      ),
    ).toBe("  $implement-ticket\nTicket: MC-123");
  });

  it("keeps slash invocation syntax for Claude Code", () => {
    expect(
      renderActionLaunchPrompt(
        { ...intent, agent: "claude-code", promptTemplate: "/implement-ticket\nTicket: MC-123" },
        "implement-mc-123",
      ),
    ).toBe("/implement-ticket\nTicket: MC-123");
  });

  it("omits worktree context when launching in the project root", () => {
    expect(
      renderActionLaunchPrompt(
        { ...intent, worktree: false, promptTemplate: "{{#worktree}}{{worktree.branch}}{{/worktree}}Start." },
        null,
      ),
    ).toBe("Start.");
  });
});
