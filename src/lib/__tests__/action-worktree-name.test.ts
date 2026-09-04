import { describe, expect, it } from "vitest";
import type { SkillAction } from "~/shared/skill-actions";
import { createActionFormState } from "../action-form";
import { resolveActionWorktreeSuggestion } from "../action-worktree-name";

const project = {
  id: "project-1",
  name: "Mission Control",
  path: "/src/mission-control",
  branch: "main",
};

function actionWithSources(sources: SkillAction["sources"]): SkillAction {
  return {
    title: "Implement ticket",
    icon: undefined,
    accent: undefined,
    skill: "implement-ticket",
    worktree: true,
    agents: ["codex"],
    sources,
    sourcesMin: 1,
    inputs: [],
    options: [],
    prompt: "test",
  };
}

describe("resolveActionWorktreeSuggestion", () => {
  it("uses a declared Jira token before free text", () => {
    const action = actionWithSources([
      { id: "jira", label: "Jira", widget: "url", token: "jira-key", icon: undefined },
      { id: "notes", label: "Notes", widget: "textarea", icon: undefined },
    ]);
    const state = createActionFormState(action, project);
    state.sources = [
      { key: "1", sourceId: "notes", value: "Keep the route compact" },
      { key: "2", sourceId: "jira", value: "https://example.atlassian.net/browse/MC-1234" },
    ];

    expect(resolveActionWorktreeSuggestion(action, state)).toEqual({
      preferredName: "implement-mc-1234",
      freeText: null,
      prefix: "implement",
    });
  });

  it("offers free text for cheap-model naming when every filled source is text", () => {
    const action = actionWithSources([
      { id: "notes", label: "Notes", widget: "textarea", icon: undefined },
      { id: "summary", label: "Summary", widget: "text", icon: undefined },
    ]);
    const state = createActionFormState(action, project);
    state.sources = [
      { key: "1", sourceId: "notes", value: "Improve the action launch flow" },
      { key: "2", sourceId: "summary", value: "Keep branch selection non-mutating" },
    ];

    expect(resolveActionWorktreeSuggestion(action, state)).toEqual({
      preferredName: null,
      freeText: "Improve the action launch flow\nKeep branch selection non-mutating",
      prefix: "implement",
    });
  });

  it("falls back without model text for unstructured URL sources", () => {
    const action = actionWithSources([
      { id: "docs", label: "Docs", widget: "url", icon: undefined },
    ]);
    const state = createActionFormState(action, project);
    state.sources[0]!.value = "https://example.test/spec";

    expect(resolveActionWorktreeSuggestion(action, state)).toEqual({
      preferredName: null,
      freeText: null,
      prefix: "implement",
    });
  });
});
