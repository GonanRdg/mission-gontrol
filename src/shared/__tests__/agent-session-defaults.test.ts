import { describe, expect, it } from "vitest";
import { normalizeAgentSessionDefaults, sessionOptionsForAgent } from "../agent-session-defaults";

describe("agent session defaults", () => {
  const defaults = { codex: { skipPermissions: true, chrome: null },
    "claude-code": { skipPermissions: false, chrome: true } };

  it("uses neutral options when preferences are absent", () => {
    expect(sessionOptionsForAgent("claude-code")).toEqual({ skipPermissions: false, chrome: null });
  });

  it("uses each agent's defaults instead of stale unremembered project options", () => {
    const project = { savedAgent: "claude-code" as const, savedSkipPermissions: true,
      savedClaudeChrome: false, rememberAgentSettings: false };
    expect(sessionOptionsForAgent("claude-code", defaults, project)).toEqual(defaults["claude-code"]);
    expect(sessionOptionsForAgent("codex", defaults, project)).toEqual(defaults.codex);
  });

  it("preserves explicit remembered choices over global defaults", () => {
    expect(sessionOptionsForAgent("claude-code", defaults, {
      savedAgent: "claude-code", savedSkipPermissions: true, savedClaudeChrome: false,
      rememberAgentSettings: true,
    })).toEqual({ skipPermissions: true, chrome: false });
    expect(sessionOptionsForAgent("codex", defaults, {
      savedAgent: "codex", savedSkipPermissions: false, rememberAgentSettings: true,
    })).toEqual({ skipPermissions: false, chrome: null });
  });

  it("does not carry a previous agent's permissions or browser setting to another agent", () => {
    expect(sessionOptionsForAgent("codex", {}, {
      savedAgent: "claude-code", savedSkipPermissions: true, savedClaudeChrome: true,
      rememberAgentSettings: true,
    })).toEqual({ skipPermissions: false, chrome: null });
  });

  it("normalizes persisted values and removes unsupported options", () => {
    expect(normalizeAgentSessionDefaults({
      "claude-code": { skipPermissions: "true", chrome: false },
      codex: { skipPermissions: true, chrome: true },
      opencode: { skipPermissions: true, chrome: true },
      unknown: { skipPermissions: true },
    })).toEqual({
      "claude-code": { skipPermissions: false, chrome: false },
      codex: { skipPermissions: true, chrome: null },
      opencode: { skipPermissions: false, chrome: null },
    });
    expect(normalizeAgentSessionDefaults(null)).toEqual({});
  });
});
