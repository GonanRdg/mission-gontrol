import type { ActionFormState } from "./action-form";
import type { SkillAction } from "~/shared/skill-actions";

function matchingSource(action: SkillAction, value: string): string | null {
  const lower = value.toLowerCase();
  const candidates = action.sources.filter((source) => source.widget !== "textarea");
  const match = (terms: string[]) =>
    candidates.find((source) => terms.some((term) => source.id.includes(term)))?.id ?? null;

  if (/\b[A-Z][A-Z0-9]+-\d+\b/.test(value) || lower.includes("atlassian.net/") || lower.includes("/browse/")) {
    return match(["jira", "ticket", "issue"]);
  }
  if (lower.includes("slack.com/archives/")) return match(["slack"]);
  if (lower.includes("github.com/") || lower.includes("gitlab.com/")) return match(["github", "gitlab", "git"]);
  if (/^(?:\.\.?\/|\/)[^\s]+$/.test(value)) return match(["file", "path"]);
  return null;
}

export function addQuickContext(
  action: SkillAction,
  state: ActionFormState,
  text: string,
): ActionFormState {
  const original = text.trim();
  if (!original || action.sources.length === 0) return state;

  const additions: Array<{ sourceId: string; value: string }> = [];
  const seen = new Set<string>();
  for (const token of original.split(/\s+/)) {
    const value = token.replace(/^[<(]+/, "").replace(/^\[+/, "").replace(/[>),.;]+$/, "").replace(/\]+$/, "");
    const sourceId = matchingSource(action, value);
    if (!sourceId || seen.has(`${sourceId}\0${value}`)) continue;
    seen.add(`${sourceId}\0${value}`);
    additions.push({ sourceId, value });
  }

  const notes =
    action.sources.find((source) => source.widget === "textarea") ??
    action.sources.find((source) => source.id === "text" || source.id === "notes") ??
    action.sources[0]!;
  additions.push({ sourceId: notes.id, value: original });

  const existing = state.sources.filter((row) => row.value.trim());
  const rows = [...existing];
  for (const addition of additions) {
    if (rows.some((row) => row.sourceId === addition.sourceId && row.value.trim() === addition.value)) continue;
    rows.push({
      key: `quick-${rows.length + 1}-${addition.sourceId}`,
      ...addition,
    });
  }
  return { ...state, sources: rows };
}
