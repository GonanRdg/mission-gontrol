import type { TaskAgent } from "~/shared/domain";
import { renderActionPrompt, type ActionTemplateContext } from "~/lib/action-template";

export type ActionLaunchIntent = {
  actionName: string;
  workflowSkill: string;
  defaultWorkflowSkill: string;
  agent: TaskAgent;
  branch: string;
  promptTemplate: string;
  promptContext: ActionTemplateContext;
  worktree: boolean;
  preferredWorktreeName: string | null;
  worktreeFreeText: string | null;
  worktreePrefix: string;
};

export function adaptActionPromptForAgent(
  prompt: string,
  workflowSkill: string,
  agent: TaskAgent,
): string {
  if (agent !== "codex") return prompt;

  const firstContent = prompt.search(/\S/);
  if (firstContent < 0) return prompt;
  const invocation = `/${workflowSkill}`;
  if (!prompt.startsWith(invocation, firstContent)) return prompt;

  const boundary = prompt[firstContent + invocation.length];
  if (boundary && !/\s/.test(boundary)) return prompt;
  return `${prompt.slice(0, firstContent)}$${workflowSkill}${prompt.slice(firstContent + invocation.length)}`;
}

export function selectActionWorkflow(
  prompt: string,
  defaultWorkflowSkill: string,
  workflowSkill: string,
): string {
  if (defaultWorkflowSkill === workflowSkill) return prompt;
  const firstContent = prompt.search(/\S/);
  if (firstContent < 0) return prompt;
  const invocation = `/${defaultWorkflowSkill}`;
  if (!prompt.startsWith(invocation, firstContent)) return prompt;
  const boundary = prompt[firstContent + invocation.length];
  if (boundary && !/\s/.test(boundary)) return prompt;
  return `${prompt.slice(0, firstContent)}/${workflowSkill}${prompt.slice(firstContent + invocation.length)}`;
}

export function renderActionLaunchPrompt(
  intent: ActionLaunchIntent,
  worktreeBranch: string | null,
): string {
  const prompt = renderActionPrompt(intent.promptTemplate, {
    ...intent.promptContext,
    worktree: intent.worktree && worktreeBranch ? { branch: worktreeBranch } : null,
  });
  return adaptActionPromptForAgent(
    selectActionWorkflow(prompt, intent.defaultWorkflowSkill, intent.workflowSkill),
    intent.workflowSkill,
    intent.agent,
  );
}

const pending = new Map<string, ActionLaunchIntent>();
const RECENT_ACTIONS_KEY = "mission-control:recent-action-launches";

export type RecentActionLaunch = {
  projectId: string;
  intent: ActionLaunchIntent;
  launchedAt: number;
};

export function readRecentActionLaunches(projectId?: string): RecentActionLaunch[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ACTIONS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RecentActionLaunch => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<RecentActionLaunch>;
      return (
        typeof candidate.projectId === "string" &&
        typeof candidate.launchedAt === "number" &&
        !!candidate.intent &&
        typeof candidate.intent.actionName === "string"
      );
    }).filter((entry) => !projectId || entry.projectId === projectId);
  } catch {
    return [];
  }
}

export function rememberActionLaunch(projectId: string, intent: ActionLaunchIntent): void {
  if (typeof localStorage === "undefined") return;
  try {
    const recent = readRecentActionLaunches().filter(
      (entry) => entry.projectId !== projectId || entry.intent.actionName !== intent.actionName,
    );
    recent.unshift({ projectId, intent, launchedAt: Date.now() });
    localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(recent.slice(0, 8)));
  } catch {
    // Recent runs are a convenience; storage failure must not block launching.
  }
}

export function markActionLaunchIntent(projectId: string, intent: ActionLaunchIntent): void {
  pending.set(projectId, intent);
}

export function consumeActionLaunchIntent(projectId: string): ActionLaunchIntent | null {
  const intent = pending.get(projectId) ?? null;
  if (intent) pending.delete(projectId);
  return intent;
}
