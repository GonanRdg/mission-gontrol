import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ActionListItem } from "~/shared/skill-actions";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-action-workflow-api-"));
process.env.MC_USER_DATA_DIR = tmpRoot;

const { handleApiRequest } = await import("../api-router");
const { getOrCreateApiToken } = await import("../services/settings");
const { createProject } = await import("../services/projects");
const { getDb } = await import("~/db/client");
const { projects, tasks, groups, appSettings, worktrees } = await import("~/db/schema");

const LOOPBACK_HEADERS = { origin: "http://127.0.0.1:5173" };

function authed(input: string, init: RequestInit = {}): Request {
  return new Request(`http://127.0.0.1:5173${input}`, {
    ...init,
    headers: {
      ...LOOPBACK_HEADERS,
      authorization: `Bearer ${getOrCreateApiToken()}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function writeSkill(root: string, name: string, contents: string): void {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), contents);
}

describe("action workflow API", () => {
  let projectId = "";
  let projectPath = "";

  beforeEach(() => {
    const db = getDb();
    db.delete(tasks).run();
    db.delete(worktrees).run();
    db.delete(projects).run();
    db.delete(groups).run();
    db.delete(appSettings).run();

    projectPath = fs.mkdtempSync(path.join(tmpRoot, "project-"));
    const root = path.join(projectPath, ".codex", "skills");
    writeSkill(root, "phase-four-api-action", `---
name: phase-four-api-action
description: Test workflow availability.
mc-action:
  title: Phase four API action
  skill: phase-four-api-workflow
  agents: [codex]
  prompt: /phase-four-api-workflow
---
`);
    writeSkill(root, "phase-four-api-workflow", `---
name: phase-four-api-workflow
description: Test workflow.
---
`);
    projectId = createProject({ name: "action-workflow", path: projectPath }).id;
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reports selected-agent workflow availability with source and destination", async () => {
    const response = await handleApiRequest(
      authed(`/api/skills/actions?projectId=${encodeURIComponent(projectId)}`),
    );
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { actions: ActionListItem[] };
    const action = body.actions.find((candidate) => candidate.name === "phase-four-api-action");

    expect(action?.ok && action.workflows.codex).toMatchObject({
      status: "available",
      sourcePath: path.join(projectPath, ".codex", "skills", "phase-four-api-workflow"),
      installMethod: null,
    });
  });

  it("keeps installation idempotent when the workflow is already available", async () => {
    const response = await handleApiRequest(
      authed("/api/skills/actions/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          actionName: "phase-four-api-action",
          agent: "codex",
        }),
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      availability: { agent: "codex", status: "available" },
    });
  });

  it("rejects an agent excluded by the action", async () => {
    const response = await handleApiRequest(
      authed("/api/skills/actions/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          actionName: "phase-four-api-action",
          agent: "claude-code",
        }),
      }),
    );

    expect(response?.status).toBe(400);
  });

  it("persists form choices without accepting source values", async () => {
    const preferences = {
      repository: projectPath,
      agent: "codex",
      branch: "feat/actions",
      options: { review: true },
      sourceTypes: ["text"],
    };
    const update = await handleApiRequest(
      authed("/api/skills/actions/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          actionName: "phase-four-api-action",
          preferences,
        }),
      }),
    );
    expect(update?.status).toBe(200);

    const read = await handleApiRequest(
      authed(
        `/api/skills/actions/preferences?projectId=${encodeURIComponent(projectId)}&actionName=phase-four-api-action`,
      ),
    );
    await expect(read?.json()).resolves.toEqual({ preferences });

    const rejected = await handleApiRequest(
      authed("/api/skills/actions/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          actionName: "phase-four-api-action",
          preferences: { ...preferences, sourceValues: ["MC-123"] },
        }),
      }),
    );
    expect(rejected?.status).toBe(400);
  });
});
