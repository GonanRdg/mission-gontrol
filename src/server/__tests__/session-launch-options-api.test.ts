import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project, Task } from "~/db/schema";
import { buildAgentLaunchCommand } from "~/lib/agent-command";
import { defaultSessionPayload } from "~/lib/session-warm-pool";

process.env.MC_USER_DATA_DIR = mkdtempSync(join(tmpdir(), "mc-session-options-test-"));
const { handleApiRequest } = await import("../api-router");
const { getOrCreateApiToken } = await import("../services/settings");
const { createProject } = await import("../services/projects");

async function request(path: string, body?: unknown, method = "POST") {
  const response = await handleApiRequest(new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : method,
    headers: { authorization: `Bearer ${getOrCreateApiToken()}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return response!;
}

describe("session launch options API", () => {
  it("keeps existing installs neutral and persists independent agent defaults", async () => {
    expect((await (await request("/api/settings")).json()).agentSessionDefaults).toEqual({});
    const agentSessionDefaults = {
      "claude-code": { skipPermissions: false, chrome: true },
      codex: { skipPermissions: true, chrome: null },
    };
    expect((await request("/api/settings", { agentSessionDefaults })).status).toBe(200);
    expect((await (await request("/api/settings")).json()).agentSessionDefaults).toEqual(agentSessionDefaults);

    const project = createProject({ path: mkdtempSync(join(tmpdir(), "mc-session-project-")),
      savedAgent: "codex", rememberAgentSettings: true });
    expect(defaultSessionPayload(project, agentSessionDefaults)).toMatchObject({ agent: "codex", skipPermissions: true });
    const claudeProject = createProject({ path: mkdtempSync(join(tmpdir(), "mc-chrome-project-")),
      savedAgent: "claude-code", rememberAgentSettings: true });
    expect(claudeProject.savedClaudeChrome).toBe(true);
  });

  it.each([true, false, null])("round-trips Chrome=%s through project and task storage and resume", async (chrome) => {
    const project = createProject({ path: mkdtempSync(join(tmpdir(), "mc-chrome-roundtrip-")) });
    const update = await request(`/api/projects/${project.id}`, {
      rememberAgentSettings: true, savedAgent: "claude-code", savedSkipPermissions: true, savedClaudeChrome: chrome,
    }, "PATCH");
    expect(update.status).toBe(200);
    const savedProject = (await (await request(`/api/projects/${project.id}`)).json()).project as Project;
    expect(defaultSessionPayload(savedProject)).toMatchObject({ chrome, skipPermissions: true });

    const sessionId = "00000000-0000-4000-8000-000000000000";
    const create = await request(`/api/projects/${project.id}/tasks`, {
      title: "Browser validation", agent: "claude-code", claudeSessionId: sessionId,
      claudeChrome: chrome, claudeSkipPermissions: true,
    });
    expect(create.status).toBe(201);
    const createdTask = (await create.json()).task as Task;
    const persisted = (await (await request(`/api/tasks/${createdTask.id}`)).json()).task as Task;
    expect(persisted.claudeChrome).toBe(chrome);
    const flag = chrome === null ? "" : chrome ? " --chrome" : " --no-chrome";
    expect(buildAgentLaunchCommand(persisted, sessionId, "resume"))
      .toBe(`claude --resume ${sessionId} --dangerously-skip-permissions${flag}`);
  });

  it("rejects malformed preferences", async () => {
    expect((await request("/api/settings", { agentSessionDefaults: { codex: { skipPermissions: "true", chrome: null } } })).status).toBe(400);
  });
});
