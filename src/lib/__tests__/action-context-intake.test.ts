import { describe, expect, it } from "vitest";
import { addQuickContext } from "../action-context-intake";
import type { SkillAction } from "~/shared/skill-actions";

const action: SkillAction = {
  title: "Investigate issue",
  icon: undefined,
  accent: undefined,
  skill: "investigate-issue",
  worktree: true,
  sourcesMin: 1,
  inputs: [],
  options: [],
  prompt: "test",
  sources: [
    { id: "jira", label: "Jira", widget: "text", icon: undefined },
    { id: "slack", label: "Slack", widget: "url", icon: undefined },
    { id: "text", label: "Notes", widget: "textarea", icon: undefined },
  ],
};

describe("addQuickContext", () => {
  it("extracts recognizable references and preserves the complete paste as notes", () => {
    const result = addQuickContext(
      action,
      { agent: "codex", inputs: {}, options: {}, sources: [] },
      "Investigate ABC-123 from https://lodgify.slack.com/archives/C1/p2\nTimeout after retry.",
    );

    expect(result.sources.map(({ sourceId, value }) => ({ sourceId, value }))).toEqual([
      { sourceId: "jira", value: "ABC-123" },
      { sourceId: "slack", value: "https://lodgify.slack.com/archives/C1/p2" },
      {
        sourceId: "text",
        value: "Investigate ABC-123 from https://lodgify.slack.com/archives/C1/p2\nTimeout after retry.",
      },
    ]);
  });

  it("does not add the same quick context twice", () => {
    const once = addQuickContext(action, { agent: "codex", inputs: {}, options: {}, sources: [] }, "ABC-123");
    expect(addQuickContext(action, once, "ABC-123").sources).toEqual(once.sources);
  });
});
