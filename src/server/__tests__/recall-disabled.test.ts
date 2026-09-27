import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.MC_USER_DATA_DIR = mkdtempSync(join(tmpdir(), "mg-recall-disabled-"));
const { createProject } = await import("../services/projects");
const { createMemory, listMemory } = await import("../services/project-memory");
const { writeRecallSettings, readRecallSettings } = await import("../services/recall-settings");
const { getOrCreateApiToken, getSetting } = await import("../services/settings");
const { handleApiRequest } = await import("../api-router");
const { normalizeSettingsPanelId } = await import("~/components/views/settings-panel-ids");

describe("Recall retired in Mission Gontrol", () => {
  it("preserves saved memory while refusing access and ignoring an enabled preference", async () => {
    const project = createProject({ name: "Existing project", path: mkdtempSync(join(tmpdir(), "mg-project-")) });
    const memory = createMemory({ projectId: project.id, type: "stack", title: "Existing knowledge" });
    writeRecallSettings({ enabled: true, autoCaptureEnabled: true, agentWriteEnabled: true });
    expect(readRecallSettings()).toMatchObject({
      enabled: false, autoCaptureEnabled: false, recallEngineEnabled: false,
      agentWriteEnabled: false, injectBriefEnabled: false, codeGraphEnabled: false,
      proactiveRecallEnabled: false, learnedToastEnabled: false,
    });
    expect(getSetting("recall_enabled")).toBe("true");
    const response = await handleApiRequest(new Request(`http://127.0.0.1:5173/api/projects/${project.id}/memory`, {
      headers: { origin: "http://127.0.0.1:5173", authorization: `Bearer ${getOrCreateApiToken()}` },
    }));
    expect(response?.status).toBe(403);
    expect(listMemory(project.id)).toEqual([memory]);
  });

  it("redirects old Recall settings links to General", () => {
    expect(normalizeSettingsPanelId("recall")).toBe("general");
    expect(normalizeSettingsPanelId("memory")).toBe("general");
  });
});
