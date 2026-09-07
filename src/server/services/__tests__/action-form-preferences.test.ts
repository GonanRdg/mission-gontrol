import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mc-action-form-preferences-"));
process.env.MC_USER_DATA_DIR = tmpRoot;

const { getDb } = await import("~/db/client");
const { appSettings } = await import("~/db/schema");
const {
  readActionFormPreferences,
  writeActionFormPreferences,
} = await import("../action-form-preferences");

const first = {
  repository: "/src/first",
  agent: "codex" as const,
  branch: "feat/first",
  options: { plan: true },
  sourceTypes: ["jira", "text"],
};

describe("action form preferences", () => {
  beforeEach(() => {
    getDb().delete(appSettings).run();
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("keeps action and project entries isolated in one settings blob", () => {
    writeActionFormPreferences("project-1", "implement", first);
    writeActionFormPreferences("project-1", "review", { ...first, branch: "main" });
    writeActionFormPreferences("project-2", "implement", { ...first, agent: "claude-code" });

    expect(readActionFormPreferences("project-1", "implement")).toEqual(first);
    expect(readActionFormPreferences("project-1", "review")?.branch).toBe("main");
    expect(readActionFormPreferences("project-2", "implement")?.agent).toBe("claude-code");
    expect(readActionFormPreferences("missing", "implement")).toBeNull();
  });

  it("replaces one entry without losing its neighbours", () => {
    writeActionFormPreferences("project-1", "implement", first);
    writeActionFormPreferences("project-1", "review", { ...first, branch: "main" });
    writeActionFormPreferences("project-1", "implement", { ...first, options: { plan: false } });

    expect(readActionFormPreferences("project-1", "implement")?.options).toEqual({ plan: false });
    expect(readActionFormPreferences("project-1", "review")?.branch).toBe("main");
  });
});
