import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-active-sessions-api-test-"));
process.env.MC_USER_DATA_DIR = tmpRoot;

const { handleApiRequest } = await import("../api-router");
const { getOrCreateApiToken } = await import("../services/settings");
const { createProject } = await import("../services/projects");
const { createTask, updateStatus, archiveTask, getTask } = await import("../services/tasks");
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

describe("GET /api/tasks/search", () => {
  beforeEach(resetDb);

  async function search(query: string) {
    return handleApiRequest(new Request(`http://127.0.0.1:5173/api/tasks/search?q=${encodeURIComponent(query)}`, {
      headers: { origin: "http://127.0.0.1:5173", authorization: `Bearer ${getOrCreateApiToken()}` },
    }));
  }

  function project() {
    return createProject({ name: "Search project", path: fs.mkdtempSync(path.join(os.tmpdir(), "mc-title-search-")) });
  }

  it("finds an archived session by title without any captured prompts", async () => {
    const owner = project();
    const archived = createTask({ projectId: owner.id, title: "I have been noticing lately in Mission Gontrol", agent: "codex" });
    archiveTask(archived.id);

    const response = await search("i have been");
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ sessions: [{
      taskId: archived.id, title: archived.title, archived: true,
      projectId: owner.id, worktreeId: null, scopeId: "local",
    }] });
    expect(getTask(archived.id)?.archived).toBe(true);
  });

  it("searches titles across projects, statuses, and older finished sessions", async () => {
    const first = project();
    const second = project();
    const old = createTask({ projectId: first.id, title: "Distinctive old title", agent: "claude-code", status: "finished" });
    const ready = createTask({ projectId: second.id, title: "Distinctive ready title", agent: "codex" });
    for (let i = 0; i < 12; i++) createTask({ projectId: first.id, title: `Recent ${i}`, agent: "codex", status: "finished" });
    const response = await search("distinctive");
    expect(response?.status).toBe(200);
    const body = await response!.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: old.id, archived: false }),
      expect.objectContaining({ taskId: ready.id, projectId: second.id }),
    ]));
  });

  it("matches all title words and treats SQL wildcards literally", async () => {
    const owner = project();
    const literal = createTask({ projectId: owner.id, title: "Check 100%_done with back\\slash", agent: "codex" });
    createTask({ projectId: owner.id, title: "Check 100XXdone", agent: "codex" });
    for (const query of ["100%_done", "back\\slash", "done Check"]) {
      const response = await search(query);
      expect(response?.status).toBe(200);
      const body = await response!.json();
      if (query !== "done Check") expect(body.sessions).toHaveLength(1);
      expect(body.sessions).toContainEqual(expect.objectContaining({ taskId: literal.id }));
    }
    expect(await (await search("  "))!.json()).toEqual({ sessions: [] });
  });
});
