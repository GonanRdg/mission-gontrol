import { describe, expect, it } from "vitest";
import {
  PARENT_AGENT_SESSION_ENV_KEYS,
  stripParentAgentSessionEnv,
} from "../shell-env";

describe("stripParentAgentSessionEnv", () => {
  it("drops the launching session's identity and messaging credentials", () => {
    const env = {
      CLAUDE_CODE_CHILD_SESSION: "1",
      CLAUDE_CODE_SESSION_ID: "abc-123",
      CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/mc.sock",
      CLAUDE_CODE_MESSAGING_TOKEN: "secret",
      PATH: "/usr/bin",
    };

    expect(stripParentAgentSessionEnv({ ...env })).toEqual({ PATH: "/usr/bin" });
  });

  it("keeps the Claude vars that are not session identity", () => {
    const stripped = stripParentAgentSessionEnv({
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      CLAUDE_CODE_EXECPATH: "/usr/local/bin/claude",
      CLAUDE_CODE_CHILD_SESSION: "1",
    });

    expect(stripped).toEqual({
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      CLAUDE_CODE_EXECPATH: "/usr/local/bin/claude",
    });
  });

  it("is a no-op when no marker is present", () => {
    expect(stripParentAgentSessionEnv({ PATH: "/usr/bin", SHELL: "/bin/zsh" })).toEqual({
      PATH: "/usr/bin",
      SHELL: "/bin/zsh",
    });
  });

  it("mutates in place so callers building an env object see the removal", () => {
    const env: Record<string, string> = { CLAUDE_CODE_SESSION_ID: "abc" };
    stripParentAgentSessionEnv(env);
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  });

  it("covers every key the sanitizer promises to remove", () => {
    expect([...PARENT_AGENT_SESSION_ENV_KEYS]).toEqual([
      "CLAUDE_CODE_CHILD_SESSION",
      "CLAUDE_CODE_SESSION_ID",
      "CLAUDE_CODE_MESSAGING_SOCKET",
      "CLAUDE_CODE_MESSAGING_TOKEN",
    ]);
  });
});
