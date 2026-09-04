import type { TaskAgent } from "~/shared/domain";
import { renderActionPrompt, type ActionTemplateContext } from "~/lib/action-template";

export type ActionLaunchIntent = {
  actionName: string;
  agent: TaskAgent;
  branch: string;
  promptTemplate: string;
  promptContext: ActionTemplateContext;
  worktree: boolean;
  preferredWorktreeName: string | null;
  worktreeFreeText: string | null;
  worktreePrefix: string;
};

export function renderActionLaunchPrompt(
  intent: ActionLaunchIntent,
  worktreeBranch: string | null,
): string {
  return renderActionPrompt(intent.promptTemplate, {
    ...intent.promptContext,
    worktree: intent.worktree && worktreeBranch ? { branch: worktreeBranch } : null,
  });
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
