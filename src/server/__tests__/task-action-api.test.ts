import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-task-action-api-test-"));
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

function resetDb() {
  const db = getDb();
  db.delete(tasks).run();
  db.delete(worktrees).run();
  db.delete(projects).run();
  db.delete(groups).run();
  db.delete(appSettings).run();
}

async function createTask(projectId: string, action?: string) {
  const response = await handleApiRequest(
    authed(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Action run", agent: "codex", action }),
    }),
  );

  expect(response?.status).toBe(201);
  return response!.json();
}

describe("task action persistence", () => {
  beforeEach(resetDb);

  it("round-trips an action name through the task API", async () => {
    const project = createProject({
      name: "task-action",
      path: fs.mkdtempSync(path.join(os.tmpdir(), "mc-task-action-proj-")),
    });

    const body = await createTask(project.id, "implement-feature");

    expect(body.task.action).toBe("implement-feature");
  });

  it("keeps action nullable for ordinary sessions", async () => {
    const project = createProject({
      name: "ordinary-task",
      path: fs.mkdtempSync(path.join(os.tmpdir(), "mc-ordinary-task-proj-")),
    });

    const body = await createTask(project.id);

    expect(body.task.action).toBeNull();
  });
});
