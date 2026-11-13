import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const root = mkdtempSync(join(tmpdir(), "mc-tickets-api-"));
process.env.MC_USER_DATA_DIR = root;
vi.mock("../services/_spawn", () => ({ spawnCapture: vi.fn() }));
const { handleApiRequest } = await import("../api-router");
const { getOrCreateApiToken } = await import("../services/settings");
const { createProject } = await import("../services/projects");
const repo = join(root, "repo"); mkdirSync(repo);
const project = createProject({ name: "Tickets", path: repo });
const request = (path: string, method = "GET", body?: unknown, authorized = true) => new Request(`http://127.0.0.1:5173/api/${path}`, { method, headers: { origin: "http://127.0.0.1:5173", "content-type": "application/json", ...(authorized ? { authorization: `Bearer ${getOrCreateApiToken()}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
describe("ticket API", () => {
  it("keeps browser filters per project without provider authentication", async () => {
    const secondPath = join(root, "second"); mkdirSync(secondPath);
    const second = createProject({ name: "Second", path: secondPath });
    const path = `projects/${project.id}/tickets/browser`;
    expect((await handleApiRequest(request(path, "GET", undefined, false)))?.status).toBe(401);
    const settings = { workspaceUrl: "https://example.atlassian.net", project: "Example Project", keywords: "statements*", title: true, description: false, pendingOnly: true };
    expect((await handleApiRequest(request(path, "PUT", settings)))?.status).toBe(200);
    expect(await (await handleApiRequest(request(path)))!.json()).toEqual(settings);
    expect(await (await handleApiRequest(request(`projects/${second.id}/tickets/browser`)))!.json()).toMatchObject({ workspaceUrl: "", project: "", keywords: "" });
    expect((await handleApiRequest(request(path, "PUT", { ...settings, workspaceUrl: "https://attacker.example" })))?.status).toBe(400);
    expect((await handleApiRequest(request(path, "PUT", { ...settings, title: false, description: false })))?.status).toBe(400);
    expect((await handleApiRequest(request("projects/missing/tickets/browser")))?.status).toBe(404);
  });
  it.each(["tickets/connection", "tickets/projects", `projects/${project.id}/tickets`, `projects/${project.id}/tickets/APP-1`])("requires local API authentication for %s", async path => {
    const result = await handleApiRequest(request(path, "GET", undefined, false));
    expect(result?.status).toBe(401);
  });
  it("rejects non-Jira sites and does not disclose OAuth credentials", async () => {
    const invalid = await handleApiRequest(request("tickets/connection", "PUT", { provider: "jira", workspaceUrl: "https://attacker.example" }));
    expect(invalid?.status).toBe(400);
    const result = await handleApiRequest(request("tickets/connection"));
    const body = await result!.json();
    expect(Object.keys(body).sort()).toEqual(["connected", "connecting", "oauthConfigured", "provider", "workspaceUrl"]);
  });
  it("rejects unknown local repos and invalid mutation payloads before provider access", async () => {
    expect((await handleApiRequest(request("projects/missing/tickets/filters")))?.status).toBe(404);
    expect((await handleApiRequest(request(`projects/${project.id}/tickets/APP-1`, "PATCH", { title: "", secret: "unexpected" })))?.status).toBe(400);
    expect((await handleApiRequest(request(`projects/${project.id}/tickets/APP-1/comments`, "POST", { body: "" })))?.status).toBe(400);
  });
});
