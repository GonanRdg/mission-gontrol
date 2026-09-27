import type { TaskAgent } from "~/shared/domain";
import { WORKTREE_NAME_RE } from "~/shared/worktrees";
import { runCli } from "./claude-cli";
import { resolveSafePrintInvocation } from "./title-generator";

type NameRunner = (command: string, args: string[]) => Promise<string>;

export function sanitizeActionWorktreeName(raw: string, rawPrefix: string): string | null {
  const prefix = rawPrefix.toLowerCase().match(/[a-z0-9]+/)?.[0] ?? "action";
  const response = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("```"))
    .at(-1);
  if (!response) return null;

  const parts = response
    .toLowerCase()
    .replace(/^[a-z ]+\s*:\s*/, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (parts[0] === prefix) parts.shift();
  const name = [prefix, ...parts.slice(0, 4)].join("-");
  return WORKTREE_NAME_RE.test(name) ? name : null;
}

export async function generateActionWorktreeName(
  input: { agent: TaskAgent; prefix: string; text: string },
  runner: NameRunner = runCli,
): Promise<string | null> {
  const invocation = resolveSafePrintInvocation(
    input.agent,
    [
      "Name a git worktree for this task.",
      "Reply with 1 to 4 lowercase words separated by hyphens and nothing else.",
      "Do not include the workflow name or a numeric suffix.",
      "",
      input.text,
    ].join("\n"),
  );
  if (!invocation) return null;
  try {
    return sanitizeActionWorktreeName(
      await runner(invocation.cmd, invocation.args),
      input.prefix,
    );
  } catch {
    return null;
  }
}
