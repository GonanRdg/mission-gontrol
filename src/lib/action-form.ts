import type { TaskAgent } from "~/shared/domain";
import type { ActionFormPreferences } from "~/shared/action-form-preferences";
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
  if (field.widget === "branch") return "";
  if (field.widget === "checkbox") return false;
  if (field.widget === "select") return field.choices?.[0]?.value ?? "";
  return "";
}

export function createActionFormState(
  action: SkillAction,
  project: ActionFormProject,
  preferences: ActionFormPreferences | null = null,
): ActionFormState {
  const sourceCount = action.sources.length > 0 ? Math.max(1, action.sourcesMin) : 0;
  const firstSource = action.sources[0];
  const firstSourceId = firstSource?.id ?? "";
  const inputs = Object.fromEntries(
    action.inputs.map((input) => {
      let value = getActionFieldInitialValue(input, project);
      if (input.widget === "project" && preferences?.repository != null) {
        value = preferences.repository;
      }
      if (input.widget === "branch" && preferences?.branch != null) {
        value = preferences.branch;
      }
      return [input.id, value];
    }),
  );
  const validSourceTypes = new Set(action.sources.map((source) => source.id));
  const sourceTypes = preferences
    ? preferences.sourceTypes.filter((sourceId) => validSourceTypes.has(sourceId))
    : Array.from({ length: sourceCount }, () => firstSourceId);
  while (sourceTypes.length < sourceCount) sourceTypes.push(firstSourceId);
  const availableAgents = action.agents;
  const agent =
    preferences && (!availableAgents || availableAgents.includes(preferences.agent))
      ? preferences.agent
      : (availableAgents?.[0] ?? "claude-code");

  return {
    sources: sourceTypes.map((sourceId, index) => {
      const source = action.sources.find((candidate) => candidate.id === sourceId);
      return {
        key: `source-${index + 1}`,
        sourceId,
        value: source ? String(getActionFieldInitialValue(source, project)) : "",
      };
    }),
    inputs,
    options: Object.fromEntries(
      action.options.map((option) => [
        option.id,
        preferences?.options[option.id] ?? option.default,
      ]),
    ),
    agent,
  };
}

export function getActionFormPreferences(
  action: SkillAction,
  state: ActionFormState,
  workflowSkill: string | null = null,
): ActionFormPreferences {
  const projectInput = action.inputs.find((input) => input.widget === "project");
  const branchInput = action.inputs.find((input) => input.widget === "branch");
  return {
    repository: projectInput ? String(state.inputs[projectInput.id] ?? "") : null,
    agent: state.agent,
    branch: branchInput ? String(state.inputs[branchInput.id] ?? "") : null,
    options: Object.fromEntries(
      action.options.map((option) => [option.id, state.options[option.id] ?? option.default]),
    ),
    sourceTypes: state.sources.map((row) => row.sourceId),
    workflowSkill,
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
