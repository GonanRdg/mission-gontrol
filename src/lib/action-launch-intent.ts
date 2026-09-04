import type { TaskAgent } from "~/shared/domain";
import { renderActionPrompt, type ActionTemplateContext } from "~/lib/action-template";

export type ActionLaunchIntent = {
  actionName: string;
  workflowSkill: string;
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

export function renderActionLaunchPrompt(
  intent: ActionLaunchIntent,
  worktreeBranch: string | null,
): string {
  const prompt = renderActionPrompt(intent.promptTemplate, {
    ...intent.promptContext,
    worktree: intent.worktree && worktreeBranch ? { branch: worktreeBranch } : null,
  });
  return adaptActionPromptForAgent(prompt, intent.workflowSkill, intent.agent);
}

const pending = new Map<string, ActionLaunchIntent>();

export function markActionLaunchIntent(projectId: string, intent: ActionLaunchIntent): void {
  pending.set(projectId, intent);
}

export function consumeActionLaunchIntent(projectId: string): ActionLaunchIntent | null {
  const intent = pending.get(projectId) ?? null;
  if (intent) pending.delete(projectId);
  return intent;
}
