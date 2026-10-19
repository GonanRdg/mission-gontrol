import { TASK_AGENTS, type TaskAgent } from "./domain";
import { agentSupportsSkipPermissions } from "./agents";

export const AGENT_SESSION_DEFAULTS_KEY = "agent_session_defaults";

export type AgentSessionOptions = {
  skipPermissions: boolean;
  chrome: boolean | null;
};

export type AgentSessionDefaults = Partial<Record<TaskAgent, AgentSessionOptions>>;

export function normalizeAgentSessionDefaults(raw: unknown): AgentSessionDefaults {
  if (!raw || typeof raw !== "object") return {};
  const result: AgentSessionDefaults = {};
  for (const agent of TASK_AGENTS) {
    const value = (raw as Record<string, unknown>)[agent];
    if (!value || typeof value !== "object") continue;
    const input = value as Record<string, unknown>;
    result[agent] = {
      skipPermissions: agentSupportsSkipPermissions(agent) && input.skipPermissions === true,
      chrome: agent === "claude-code" && typeof input.chrome === "boolean" ? input.chrome : null,
    };
  }
  return result;
}

export function sessionOptionsForAgent(
  agent: TaskAgent,
  defaults: AgentSessionDefaults = {},
  project?: {
    rememberAgentSettings?: boolean;
    savedAgent?: TaskAgent | null;
    savedSkipPermissions?: boolean;
    savedClaudeChrome?: boolean | null;
  },
): AgentSessionOptions {
  const remembered = project?.rememberAgentSettings && project.savedAgent === agent;
  const previousAgent = !project?.savedAgent || project.savedAgent === agent;
  const options = remembered
    ? { skipPermissions: !!project?.savedSkipPermissions, chrome: project?.savedClaudeChrome ?? null }
    : defaults[agent] ?? {
        skipPermissions: previousAgent && !!project?.savedSkipPermissions,
        chrome: previousAgent ? project?.savedClaudeChrome ?? null : null,
      };
  return {
    skipPermissions: agentSupportsSkipPermissions(agent) && options.skipPermissions,
    chrome: agent === "claude-code" ? options.chrome : null,
  };
}
