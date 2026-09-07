import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { eq } from "drizzle-orm";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-active-sessions-test-"));
process.env.MC_USER_DATA_DIR = tmpRoot;

const { getDb } = await import("~/db/client");
const { appSettings, groups, projects, tasks, worktrees } = await import("~/db/schema");
const { createProject } = await import("../projects");
const { createTask, listActiveSessions } = await import("../tasks");

function resetDb() {
  const db = getDb();
  db.delete(tasks).run();
  db.delete(worktrees).run();
  db.delete(projects).run();
  db.delete(groups).run();
  db.delete(appSettings).run();
}

function makeProject(name: string) {
  return createProject({
    name,
    path: fs.mkdtempSync(path.join(os.tmpdir(), "mc-active-session-project-")),
  });
}

function setTaskState(
  id: string,
  status: "needs-input" | "running" | "interrupted" | "finished" | "ready",
  updatedAt: number,
  archived = false,
) {
  getDb().update(tasks).set({ status, updatedAt, archived }).where(eq(tasks.id, id)).run();
}

describe("active sessions", () => {
  beforeEach(resetDb);

  it("groups explicit live statuses with needs-input first", () => {
    const alpha = makeProject("Alpha");
    const beta = makeProject("Beta");
    const running = createTask({ projectId: alpha.id, title: "Running", agent: "codex" });
    const interrupted = createTask({ projectId: beta.id, title: "Interrupted", agent: "claude-code" });
    const blocked = createTask({ projectId: alpha.id, title: "Question", agent: "codex" });
    const excluded = createTask({ projectId: beta.id, title: "Ready", agent: "codex" });

    setTaskState(running.id, "running", 400);
    setTaskState(interrupted.id, "interrupted", 500);
    setTaskState(blocked.id, "needs-input", 100);
    setTaskState(excluded.id, "ready", 900);

    const result = listActiveSessions();

    expect(result.live.map((group) => group.projectName)).toEqual(["Alpha", "Beta"]);
    expect(result.live.flatMap((group) => group.sessions.map((session) => session.title))).toEqual([
      "Question",
      "Running",
      "Interrupted",
    ]);
  });

  it("returns only the ten newest unarchived finished sessions", () => {
    const project = makeProject("History");
    for (let index = 0; index < 12; index += 1) {
      const task = createTask({ projectId: project.id, title: `Finished ${index}`, agent: "codex" });
      setTaskState(task.id, "finished", index, index === 11);
    }

    const titles = listActiveSessions().recentlyFinished[0]?.sessions.map((session) => session.title);
    expect(titles).toEqual(Array.from({ length: 10 }, (_, index) => `Finished ${10 - index}`));
  });
});
