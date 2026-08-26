// Builds the prompt handed to an agent when a git action needs a human-ish
// touch. The instruction comes from settings; the context block is assembled
// here from what actually happened, so the agent starts with the failing
// command and git's own words instead of guessing.

import { outputTail, type GitRemoteAction, type GitRemoteOutcome } from "~/lib/git-remote-action-result";
import type { PullMode } from "~/server/services/git";

/** Enough stderr for the agent to work with, without pasting a whole scrollback. */
const MAX_CONTEXT_STDERR_LINES = 40;

export type GitHandoffContext = {
  instruction: string;
  projectName: string;
  branch: string | null | undefined;
  worktreeName?: string | null;
  /** Omitted for a handoff started from the menu rather than from a failure. */
  failure?: {
    action: GitRemoteAction;
    mode?: PullMode;
    message: string;
    stderr?: string;
  };
};

export function buildGitHandoffPrompt(context: GitHandoffContext): string {
  const lines: string[] = [context.instruction.trim(), "", "Context from Mission Control:"];
  lines.push(`- Project: ${context.projectName}`);
  if (context.worktreeName) lines.push(`- Worktree: ${context.worktreeName}`);
  lines.push(`- Branch: ${context.branch?.trim() || "unknown"}`);

  const failure = context.failure;
  if (!failure) {
    lines.push("- No command has failed — I want you to take over the git work from here.");
    return lines.join("\n");
  }

  const command = failure.mode ? `git ${failure.action} (${failure.mode})` : `git ${failure.action}`;
  lines.push(`- Failed command: ${command}`);
  lines.push(`- Error: ${failure.message}`);
  const stderr = outputTail(failure.stderr, MAX_CONTEXT_STDERR_LINES);
  if (stderr) {
    lines.push("- git stderr:", ...stderr.split("\n").map((line) => `    ${line}`));
  }
  return lines.join("\n");
}

/** Convenience for the failure path: pull the context straight off an outcome. */
export function gitHandoffFailureFromOutcome(
  outcome: GitRemoteOutcome,
): NonNullable<GitHandoffContext["failure"]> {
  // The outcome's detail is `message` + blank line + stderr (see
  // describeGitRemoteFailure), so split it back apart for the context block.
  const [message = "", ...rest] = outcome.detail.split("\n\n");
  const stderr = rest.join("\n\n").trim();
  return {
    action: outcome.action,
    ...(outcome.mode ? { mode: outcome.mode } : {}),
    message: message.trim() || outcome.title,
    ...(stderr ? { stderr } : {}),
  };
}
