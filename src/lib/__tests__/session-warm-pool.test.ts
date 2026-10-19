import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSessionPayload, prepareSessionWarmSlot, sessionCreateSignature } from "../session-warm-pool";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session-warm-pool", () => {
  it("separates warm sessions with different Chrome options", () => {
    const payload = { agent: "claude-code" as const, branch: "main", skipPermissions: true, bareSession: false };
    const signatures = [undefined, null, true, false].map((chrome) => sessionCreateSignature({ ...payload, chrome }, "/tmp/project"));
    expect(signatures[0]).toBe(signatures[1]);
    expect(new Set(signatures).size).toBe(3);
  });

  it("uses the explicitly selected agent's defaults for voice and action launches", () => {
    expect(defaultSessionPayload({ branch: "main", savedAgent: "claude-code", savedSkipPermissions: false },
      { codex: { skipPermissions: true, chrome: null } }, "codex"))
      .toEqual({ agent: "codex", branch: "main", skipPermissions: true, chrome: null, bareSession: false });
  });

  it("builds default payload from saved agent settings", () => {
    expect(
      defaultSessionPayload({
        branch: "main",
        rememberAgentSettings: true,
        savedAgent: "codex",
        savedSkipPermissions: true,
      }),
    ).toEqual({
      agent: "codex",
      branch: "main",
      skipPermissions: true,
      chrome: null,
      bareSession: false,
    });
  });

  it("falls back to claude-code when nothing is saved", () => {
    expect(
      defaultSessionPayload({
        branch: "dev",
        rememberAgentSettings: false,
      }),
    ).toEqual({
      agent: "claude-code",
      branch: "dev",
      skipPermissions: false,
      chrome: null,
      bareSession: false,
    });
  });

  it("remembers skip permissions without remembered agent settings", () => {
    expect(
      defaultSessionPayload({
        branch: "dev",
        rememberAgentSettings: false,
        savedSkipPermissions: true,
      }),
    ).toEqual({
      agent: "claude-code",
      branch: "dev",
      skipPermissions: true,
      chrome: null,
      bareSession: false,
    });
  });

  it("uses the last selected agent without remembered agent settings", () => {
    expect(
      defaultSessionPayload({
        branch: "dev",
        rememberAgentSettings: false,
        savedAgent: "cursor-cli",
        savedSkipPermissions: true,
      }),
    ).toEqual({
      agent: "cursor-cli",
      branch: "dev",
      skipPermissions: true,
      chrome: null,
      bareSession: false,
    });
  });

  it("does not pre-spawn a host session while Docker sandbox runtime is active", async () => {
    const spawn = vi.fn();
    vi.stubGlobal("window", {
      electronAPI: {
        sandbox: { getState: vi.fn().mockResolvedValue({ status: "connected" }) },
        pty: { spawn, kill: vi.fn() },
      },
    });

    await expect(
      prepareSessionWarmSlot({
        project: { id: "p1", path: "/Users/dev/project", activeWorktreeId: null } as never,
        payload: {
          agent: "claude-code",
          branch: "main",
          skipPermissions: false,
          bareSession: false,
        },
      }),
    ).resolves.toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });
});
