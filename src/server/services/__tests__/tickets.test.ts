import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = mkdtempSync(join(tmpdir(), "mc-tickets-"));
process.env.MC_USER_DATA_DIR = root;
const mocks = vi.hoisted(() => ({ jira: vi.fn(), spawn: vi.fn() }));
vi.mock("../ticket-oauth", async original => ({ ...await original<typeof import("../ticket-oauth")>(), jiraRequest: mocks.jira }));
vi.mock("../_spawn", () => ({ spawnCapture: mocks.spawn }));
const { createProject } = await import("../projects");
const service = await import("../tickets");
const { DEFAULT_TICKET_FILTERS } = await import("~/shared/tickets");
const repo = join(root, "repo"); mkdirSync(repo);
const project = createProject({ name: "mission-control", path: repo });
const filters = { ...DEFAULT_TICKET_FILTERS, project: "APP", repository: "fixture/repo", fieldId: "customfield_10042", keywords: ["mission-control"] };
const raw = (key: string, extra: Record<string, unknown> = {}) => ({ key, fields: { summary: "A task", project: { key: "APP" }, description: service.jiraDocument("Description"), status: { name: "To do", statusCategory: { key: "new" } }, labels: [], ...extra } });
beforeEach(() => {
  vi.resetAllMocks(); vi.unstubAllGlobals();
  service.saveTicketConnection({ provider: "jira", workspaceUrl: "https://example.atlassian.net" });
  service.saveTicketFilters(project.id, filters);
});
describe("Jira ticket provider", () => {
  it("follows paginated pending results and matches a child through a closed epic", async () => {
    mocks.jira.mockResolvedValueOnce({ issues: [raw("APP-3", { parent: { key: "APP-2" } })], nextPageToken: "next-page", isLast: false })
      .mockResolvedValueOnce({ issues: [raw("APP-2", { parent: { key: "APP-1" } })] })
      .mockResolvedValueOnce({ issues: [raw("APP-1", { customfield_10042: { value: "mission-control" }, status: { name: "Done", statusCategory: { key: "done" } } })] });
    const page = await service.listTickets(project.id);
    expect(page).toMatchObject({ scanned: 1, tickets: [{ id: "APP-3", match: { ancestor: "APP-1", keyword: "mission-control" } }] });
    expect(JSON.parse(Buffer.from(page.nextCursor!, "base64url").toString()).token).toBe("next-page");
    expect(JSON.parse(mocks.jira.mock.calls[0][1].body)).toMatchObject({ jql: expect.stringContaining("statusCategory != Done") });
    expect(mocks.jira.mock.calls.slice(1).map(call => JSON.parse(call[1].body).jql)).toEqual(['key in ("APP-2")', 'key in ("APP-1")']);
  });
  it("keeps per-repo filters isolated and validates project and field identifiers", () => {
    const secondPath = join(root, `second-${Date.now()}`); mkdirSync(secondPath);
    const second = createProject({ name: "other", path: secondPath });
    service.saveTicketFilters(second.id, { ...filters, project: "OPS", keywords: ["other"], labels: false });
    expect(service.getTicketFilters(project.id).keywords).toEqual(["mission-control"]);
    expect(service.getTicketFilters(second.id)).toMatchObject({ project: "OPS", keywords: ["other"], labels: false });
    expect(service.getTicketFilters(project.id)).toMatchObject({ project: "APP", labels: true });
    expect(() => service.saveTicketFilters(project.id, { ...filters, project: 'APP" OR project != "' })).toThrow();
    expect(() => service.saveTicketFilters(project.id, { ...filters, fieldId: "../../secret" })).toThrow();
  });
  it("queries each local project's saved Jira source independently", async () => {
    const secondPath = join(root, `independent-${Date.now()}`); mkdirSync(secondPath);
    const second = createProject({ name: "operations", path: secondPath });
    service.saveTicketFilters(second.id, { ...filters, project: "OPS", keywords: ["operations"] });
    mocks.jira.mockResolvedValue({ issues: [], isLast: true });
    await service.listTickets(project.id);
    await service.listTickets(second.id);
    const queries = mocks.jira.mock.calls.map(call => JSON.parse(call[1].body).jql);
    expect(queries[0]).toContain('project = "APP"');
    expect(queries[1]).toContain('project = "OPS"');
    expect(service.getTicketFilters(project.id).keywords).toEqual(["mission-control"]);
  });
  it("does not reuse a page token after the source filters change", async () => {
    mocks.jira.mockResolvedValueOnce({ issues: [], nextPageToken: "provider-page", isLast: false });
    const first = await service.listTickets(project.id);
    service.saveTicketFilters(project.id, { ...filters, project: "OTHER" });
    await expect(service.listTickets(project.id, first.nextCursor!)).rejects.toMatchObject({ name: "ConflictError" });
    expect(mocks.jira).toHaveBeenCalledTimes(1);
  });
  it("saves a title without rewriting the rich description", async () => {
    mocks.jira.mockImplementation(async (path: string) => path.startsWith("issue/APP-3?") ? raw("APP-3") : path.endsWith("/transitions") ? { transitions: [{ id: "21", name: "Start" }] } : path.includes("/comment?") ? { total: 0, comments: [] } : path.startsWith("mypermissions") ? { permissions: { EDIT_ISSUES: { havePermission: true } } } : path === "myself" ? { accountId: "viewer" } : null);
    await service.updateTicket(project.id, "APP-3", { title: "New title" }, service.ticketContext(project.id));
    const write = mocks.jira.mock.calls.find(call => call[1]?.method === "PUT");
    expect(JSON.parse(write![1].body)).toEqual({ fields: { summary: "New title" } });
  });
  it("rejects stale transitions and comments belonging to another author before writing", async () => {
    mocks.jira.mockImplementation(async (path: string) => path.startsWith("issue/APP-3?") ? raw("APP-3") : path.endsWith("/transitions") ? { transitions: [] } : path.includes("/comment?") ? { total: 1, comments: [{ id: "4", body: service.jiraDocument("Other comment"), author: { accountId: "other" } }] } : path.startsWith("mypermissions") ? { permissions: {} } : { accountId: "viewer" });
    await expect(service.updateTicket(project.id, "APP-3", { transitionId: "21" }, service.ticketContext(project.id))).rejects.toThrow();
    await expect(service.saveTicketComment(project.id, "APP-3", "Changed", service.ticketContext(project.id), "4")).rejects.toThrow();
    expect(mocks.jira.mock.calls.some(call => ["POST", "PUT"].includes(call[1]?.method))).toBe(false);
  });
  it("restricts issue edits to the configured project", async () => {
    mocks.jira.mockImplementation(async (path: string) => path.startsWith("issue/APP-3?") ? raw("APP-3", { project: { key: "PRIVATE" } }) : path.endsWith("/transitions") ? { transitions: [] } : path.includes("/comment?") ? { comments: [], total: 0 } : { permissions: {} });
    await expect(service.updateTicket(project.id, "APP-3", { title: "Changed" }, service.ticketContext(project.id))).rejects.toThrow();
    expect(mocks.jira.mock.calls.some(call => call[1]?.method === "PUT")).toBe(false);
  });
  it("refuses rich-comment editing rather than flattening mentions and attachments", async () => {
    mocks.jira.mockImplementation(async (path: string) => path.startsWith("issue/APP-3?") ? raw("APP-3") : path.endsWith("/transitions") ? { transitions: [] } : path.includes("/comment?") ? { total: 1, comments: [{ id: "4", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "person", text: "Person" } }] }] }, author: { accountId: "viewer" } }] } : path.startsWith("mypermissions") ? { permissions: {} } : { accountId: "viewer" });
    const ticket = await service.ticketDetail(project.id, "APP-3");
    expect(ticket.comments[0]).toMatchObject({ editable: false, editExternally: true });
    await expect(service.saveTicketComment(project.id, "APP-3", "Changed", ticket.context, "4")).rejects.toThrow();
    expect(mocks.jira.mock.calls.some(call => call[1]?.method === "PUT")).toBe(false);
  });
  it("rejects a stale source before fetching or editing a same-numbered issue", async () => {
    service.saveTicketConnection({ provider: "github", workspaceUrl: "https://github.com" });
    service.saveTicketFilters(project.id, { ...filters, field: false });
    const oldContext = service.ticketContext(project.id);
    service.saveTicketFilters(project.id, { ...filters, repository: "fixture/other", field: false });
    await expect(service.updateTicket(project.id, "1", { title: "Draft for original repo" }, oldContext)).rejects.toMatchObject({ name: "ConflictError" });
    await expect(service.saveTicketComment(project.id, "1", "Old draft", oldContext)).rejects.toMatchObject({ name: "ConflictError" });
    await expect(service.ticketDetail(project.id, "1", oldContext)).rejects.toMatchObject({ name: "ConflictError" });
    expect(mocks.spawn).not.toHaveBeenCalled(); expect(mocks.jira).not.toHaveBeenCalled();
  });
});
describe("GitHub ticket provider", () => {
  it("excludes pull requests and finds a keyword on a closed parent issue", async () => {
    service.saveTicketConnection({ provider: "github", workspaceUrl: "https://github.com" });
    service.saveTicketFilters(project.id, { ...filters, field: false });
    mocks.spawn.mockResolvedValue({ code: 0, stdout: "fixture-access-token", stderr: "" });
    const fetch = vi.fn(async (url: string) => Response.json(url.endsWith("/parent") ? { number: 10, title: "Epic", body: "mission-control", labels: [], state: "closed", repository_url: "https://api.github.com/repos/fixture/repo" } : [{ number: 11, title: "Child", body: "", state: "open", labels: [] }, { number: 12, pull_request: {} }]));
    vi.stubGlobal("fetch", fetch);
    const result = await service.listTickets(project.id);
    expect(result.tickets).toMatchObject([{ key: "#11", match: { ancestor: "#10" } }]);
    expect(fetch.mock.calls.map(call => call[0])).toContain("https://api.github.com/repos/fixture/repo/issues/11/parent");
  });
});
