/**
 * Instruction injected when a git action is handed off to an AI agent.
 *
 * Fetch/pull/push/commit run as plain git — no tokens, no session. An agent is
 * only worth spawning for the cases plain git dead-ends on: conflicts, a
 * rejected push, a tree that needs judgement about what to stage. Mission
 * Control appends the concrete situation (project, branch, failing command,
 * git's own stderr) after this instruction, so keep it about *intent* and let
 * the agent read the specifics.
 */
export const DEFAULT_GIT_HANDOFF_PROMPT =
  "Finish this git operation for me. Work out what went wrong from the error below, resolve it — including any merge or rebase conflicts — and leave the branch pushed, the working tree clean, and nothing stashed. Tell me what you did.";

export function normalizeGitHandoffPrompt(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_GIT_HANDOFF_PROMPT;
  const trimmed = value.trim();
  return trimmed || DEFAULT_GIT_HANDOFF_PROMPT;
}
