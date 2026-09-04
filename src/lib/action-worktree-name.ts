import type { ActionFormState } from "./action-form";
import type { SkillAction } from "~/shared/skill-actions";

export type ActionWorktreeSuggestion = {
  preferredName: string | null;
  freeText: string | null;
  prefix: string;
};

function actionPrefix(action: SkillAction): string {
  return action.skill.split("-").find(Boolean) ?? "action";
}

function extractToken(extractor: string, value: string): string | null {
  if (extractor === "jira-key") {
    return value.match(/\b([a-z][a-z0-9]+-\d+)\b/i)?.[1]?.toLowerCase() ?? null;
  }
  if (extractor === "pr-number") {
    const number = value.match(/\/(?:pull|issues)\/(\d+)(?:\b|\/)/i)?.[1]
      ?? value.match(/(?:^|\s)#?(\d+)(?:\s|$)/)?.[1];
    return number ? `pr-${number}` : null;
  }
  return null;
}

export function resolveActionWorktreeSuggestion(
  action: SkillAction,
  state: ActionFormState,
): ActionWorktreeSuggestion {
  const prefix = actionPrefix(action);
  const filled = state.sources
    .map((row) => ({
      source: action.sources.find((source) => source.id === row.sourceId),
      value: row.value.trim(),
    }))
    .filter((row) => row.source && row.value);

  for (const row of filled) {
    if (!row.source?.token) continue;
    const token = extractToken(row.source.token, row.value);
    if (token) return { preferredName: `${prefix}-${token}`, freeText: null, prefix };
  }

  const allFreeText =
    filled.length > 0 &&
    filled.every((row) => row.source?.widget === "text" || row.source?.widget === "textarea");
  return {
    preferredName: null,
    freeText: allFreeText ? filled.map((row) => row.value).join("\n") : null,
    prefix,
  };
}
