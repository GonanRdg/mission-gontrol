import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-active-sessions-api-test-"));
process.env.MC_USER_DATA_DIR = tmpRoot;

const { handleApiRequest } = await import("../api-router");
const { getOrCreateApiToken } = await import("../services/settings");
const { createProject } = await import("../services/projects");
const { createTask, updateStatus } = await import("../services/tasks");
const { getDb } = await import("~/db/client");
const { appSettings, groups, projects, tasks, worktrees } = await import("~/db/schema");

function resetDb() {
  const db = getDb();
  db.delete(tasks).run();
  db.delete(worktrees).run();
  db.delete(projects).run();
  db.delete(groups).run();
  db.delete(appSettings).run();
}

describe("GET /api/tasks/active", () => {
  beforeEach(resetDb);

  it("returns project-grouped live and recently finished sessions", async () => {
    const project = createProject({
      name: "Mission Control",
      path: fs.mkdtempSync(path.join(os.tmpdir(), "mc-active-sessions-api-project-")),
    });
    const live = createTask({ projectId: project.id, title: "Live task", agent: "codex" });
    const finished = createTask({ projectId: project.id, title: "Done task", agent: "claude-code" });
    updateStatus(live.id, { status: "needs-input" });
    updateStatus(finished.id, { status: "finished" });

    const response = await handleApiRequest(
      new Request("http://127.0.0.1:5173/api/tasks/active", {
        headers: {
          origin: "http://127.0.0.1:5173",
          authorization: `Bearer ${getOrCreateApiToken()}`,
        },
      }),
    );

    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({
      live: [{ projectName: "Mission Control", sessions: [{ taskId: live.id, status: "needs-input" }] }],
      recentlyFinished: [
        { projectName: "Mission Control", sessions: [{ taskId: finished.id, status: "finished" }] },
      ],
    });
  });
});
