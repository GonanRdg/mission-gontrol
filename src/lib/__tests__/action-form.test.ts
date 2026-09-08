import { describe, expect, it } from "vitest";
import type { SkillAction } from "~/shared/skill-actions";
import {
  buildActionTemplateContext,
  createActionFormState,
  getActionFormPreferences,
  validateActionForm,
} from "../action-form";

const action: SkillAction = {
  title: "Implement ticket",
  icon: undefined,
  accent: undefined,
  skill: "implement-ticket",
  worktree: true,
  agents: ["codex"],
  sources: [
    { id: "jira", label: "Jira ticket", widget: "url", icon: undefined },
    { id: "text", label: "Notes", widget: "textarea", icon: undefined },
  ],
  sourcesMin: 2,
  inputs: [
    { id: "repo", label: "Repository", widget: "project", required: true, icon: undefined },
    { id: "branch", label: "Branch", widget: "branch", required: false, icon: undefined },
    { id: "confirm", label: "Confirm", widget: "checkbox", required: true, icon: undefined },
  ],
  options: [{ id: "plan", label: "Plan", default: true }],
  prompt: "{{inputs.repo}}",
};

const project = {
  id: "project-1",
  name: "Mission Control",
  path: "/src/mission-control",
  branch: "main",
};

describe("action form state", () => {
  it("starts with enough source rows and project-aware fixed inputs", () => {
    const state = createActionFormState(action, project);

    expect(state.sources).toEqual([
      { key: "source-1", sourceId: "jira", value: "" },
      { key: "source-2", sourceId: "jira", value: "" },
    ]);
    expect(state.inputs).toEqual({
      repo: "/src/mission-control",
      branch: "",
      confirm: false,
    });
    expect(state.options).toEqual({ plan: true });
  });

  it("groups filled source rows by type without losing entry order", () => {
    const state = createActionFormState(action, project);
    state.sources = [
      { key: "1", sourceId: "jira", value: "MC-123" },
      { key: "2", sourceId: "text", value: "first note" },
      { key: "3", sourceId: "jira", value: "MC-456" },
      { key: "4", sourceId: "text", value: "" },
    ];

    expect(buildActionTemplateContext(action, state, project)).toMatchObject({
      sources: { jira: ["MC-123", "MC-456"], text: ["first note"] },
      inputs: state.inputs,
      options: state.options,
      project,
      worktree: { branch: "generated-on-start" },
    });
  });

  it("uses the first choice as the value of select fields", () => {
    const selectAction: SkillAction = {
      ...action,
      sources: [
        {
          id: "kind",
          label: "Kind",
          widget: "select",
          choices: [
            { value: "bug", label: "Bug" },
            { value: "feature", label: "Feature" },
          ],
          icon: undefined,
        },
      ],
      sourcesMin: 1,
      inputs: [
        {
          id: "priority",
          label: "Priority",
          widget: "select",
          choices: [
            { value: "normal", label: "Normal" },
            { value: "urgent", label: "Urgent" },
          ],
          required: true,
          icon: undefined,
        },
      ],
    };

    expect(createActionFormState(selectAction, project)).toMatchObject({
      sources: [{ sourceId: "kind", value: "bug" }],
      inputs: { priority: "normal" },
    });
  });

  it("restores persisted choices while leaving source values empty", () => {
    const state = createActionFormState(action, project, {
      repository: "/src/other",
      agent: "codex",
      branch: "feat/remembered",
      options: { plan: false, removed: true },
      sourceTypes: ["text", "removed", "jira"],
    });

    expect(state).toMatchObject({
      agent: "codex",
      inputs: {
        repo: "/src/other",
        branch: "feat/remembered",
      },
      options: { plan: false },
      sources: [
        { sourceId: "text", value: "" },
        { sourceId: "jira", value: "" },
      ],
    });
  });

  it("captures only reusable choices, never source values", () => {
    const state = createActionFormState(action, project);
    state.sources = [
      { key: "1", sourceId: "jira", value: "MC-123" },
      { key: "2", sourceId: "text", value: "private run context" },
    ];
    state.inputs.branch = "feat/next";
    state.options.plan = false;

    expect(getActionFormPreferences(action, state)).toEqual({
      repository: "/src/mission-control",
      agent: "codex",
      branch: "feat/next",
      options: { plan: false },
      sourceTypes: ["jira", "text"],
      workflowSkill: null,
    });
  });

  it("reports missing context rows and required inputs", () => {
    const state = createActionFormState(action, project);

    expect(validateActionForm(action, state)).toEqual([
      "Add at least 2 filled context rows.",
      "Confirm is required.",
    ]);
  });

  it("accepts a complete action form", () => {
    const state = createActionFormState(action, project);
    state.sources[0].value = "MC-123";
    state.sources[1].value = "release notes";
    state.inputs.confirm = true;

    expect(validateActionForm(action, state)).toEqual([]);
  });
});
