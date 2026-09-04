import type { TaskAgent } from "~/shared/domain";
import type { SkillAction } from "~/shared/skill-actions";
import type { ActionTemplateContext, ActionTemplateValue } from "./action-template";

export type ActionFormProject = {
  id: string;
  name: string;
  path: string;
  branch: string;
};

export type ActionSourceRow = {
  key: string;
  sourceId: string;
  value: string;
};

export type ActionFormState = {
  sources: ActionSourceRow[];
  inputs: Record<string, string | boolean>;
  options: Record<string, boolean>;
  agent: TaskAgent;
};

type ActionField = SkillAction["sources"][number] | SkillAction["inputs"][number];

export function getActionFieldInitialValue(
  field: ActionField,
  project: ActionFormProject,
): string | boolean {
  if (field.widget === "project") return project.path;
  if (field.widget === "branch") return project.branch;
  if (field.widget === "checkbox") return false;
  if (field.widget === "select") return field.choices?.[0]?.value ?? "";
  return "";
}

export function createActionFormState(
  action: SkillAction,
  project: ActionFormProject,
): ActionFormState {
  const sourceCount = action.sources.length > 0 ? Math.max(1, action.sourcesMin) : 0;
  const firstSource = action.sources[0];
  const firstSourceId = firstSource?.id ?? "";
  const inputs = Object.fromEntries(
    action.inputs.map((input) => [input.id, getActionFieldInitialValue(input, project)]),
  );

  return {
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      key: `source-${index + 1}`,
      sourceId: firstSourceId,
      value: firstSource ? String(getActionFieldInitialValue(firstSource, project)) : "",
    })),
    inputs,
    options: Object.fromEntries(action.options.map((option) => [option.id, option.default])),
    agent: action.agents?.[0] ?? "claude-code",
  };
}

export function buildActionTemplateContext(
  action: SkillAction,
  state: ActionFormState,
  project: ActionFormProject,
): ActionTemplateContext {
  const sources: Record<string, ActionTemplateValue> = Object.fromEntries(
    action.sources.map((source) => [source.id, []]),
  );
  for (const row of state.sources) {
    if (!row.value.trim()) continue;
    const values = sources[row.sourceId];
    if (Array.isArray(values)) values.push(row.value);
  }

  return {
    sources,
    inputs: state.inputs,
    options: state.options,
    agent: state.agent,
    project,
    worktree: action.worktree ? { branch: "generated-on-start" } : null,
  };
}

export function validateActionForm(action: SkillAction, state: ActionFormState): string[] {
  const issues: string[] = [];
  const filledSources = state.sources.filter((row) => row.value.trim()).length;
  if (filledSources < action.sourcesMin) {
    issues.push(
      `Add at least ${action.sourcesMin} filled context ${action.sourcesMin === 1 ? "row" : "rows"}.`,
    );
  }

  for (const input of action.inputs) {
    if (!input.required) continue;
    const value = state.inputs[input.id];
    if (input.widget === "checkbox" ? value !== true : !String(value ?? "").trim()) {
      issues.push(`${input.label} is required.`);
    }
  }

  return issues;
}
