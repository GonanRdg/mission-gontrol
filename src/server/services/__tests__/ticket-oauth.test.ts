import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
const root = mkdtempSync(join(tmpdir(), "mc-ticket-auth-"));
process.env.MC_USER_DATA_DIR = root;
const callback = vi.hoisted(() => ({ handler: null as ((request: any, response: any) => void) | null }));
const vault = vi.hoisted(() => ({ key: null as string | null, locked: false }));
vi.mock("node:child_process", () => ({ execFileSync: vi.fn((_command, args, options) => {
  if (vault.locked) throw Object.assign(new Error("locked"), { status: 36 });
  if (args[0] === "find-generic-password") {
    if (!vault.key) throw Object.assign(new Error("missing"), { status: 44 });
    return `${vault.key}\n`;
  }
  vault.key = options.input.match(/-w ([a-f0-9]{64})/)[1];
  return "";
}) }));
vi.mock("node:http", () => ({ createServer: vi.fn((handler) => {
  callback.handler = handler;
  const server = new EventEmitter() as any;
  server.listen = (_port: number, _host: string, ready: () => void) => ready();
  server.close = vi.fn(); server.unref = vi.fn(); return server;
}) }));
const auth = await import("../ticket-oauth");
const credentials = await import("../ticket-credentials");
beforeEach(() => {
  vi.stubEnv("MC_JIRA_OAUTH_CLIENT_ID", "fixture-client"); vi.stubEnv("MC_JIRA_OAUTH_CLIENT_SECRET", "fixture-secret");
  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
  vault.locked = false;
  auth.disconnectJira(); vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { auth.disconnectJira(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function deliver(url: string): Promise<{ status: number; body: string }> {
  return new Promise(resolve => {
    const response = { statusCode: 200, setHeader: vi.fn(), writeHead(status: number) { this.statusCode = status; }, end(body: string) { resolve({ status: this.statusCode, body }); } };
    callback.handler!({ url, method: "GET" }, response);
  });
}
describe("Jira OAuth", () => {
  it("migrates a legacy key into Keychain and fails closed when the vault locks", () => {
    vault.key = null;
    const legacy = join(root, "ticket-auth/key");
    writeFileSync(legacy, Buffer.alloc(32, 7));
    const value = { accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresAt: 0, cloudId: "cloud-id", workspaceUrl: "https://example.atlassian.net" };
    credentials.writeTicketCredentials(value);
    expect(vault.key).toBe(Buffer.alloc(32, 7).toString("hex"));
    expect(existsSync(legacy)).toBe(false);
    expect(credentials.readTicketCredentials()).toEqual(value);
    vault.locked = true;
    expect(() => credentials.writeTicketCredentials(value)).toThrow("Keychain");
    expect(existsSync(legacy)).toBe(false);
    vault.locked = false;
  });
  it("binds authorization to a random one-use state and selected site", async () => {
    const url = new URL(await auth.beginJiraOAuth("https://example.atlassian.net"));
    expect(url.searchParams.get("redirect_uri")).toBe(auth.JIRA_CALLBACK_URL);
    const state = url.searchParams.get("state")!;
    expect(state).toHaveLength(64);
    expect((await deliver("/callback?state=wrong&code=fixture")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(Response.json([{ id: "cloud-id", url: "https://example.atlassian.net" }]));
    expect((await deliver(`/callback?state=${state}&code=fixture`)).status).toBe(200);
    expect(auth.jiraConnected("https://example.atlassian.net")).toBe(true);
    expect(auth.jiraConnected("https://other.atlassian.net")).toBe(false);
    expect((await deliver(`/callback?state=${state}&code=fixture`)).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(2);
    const encrypted = readFileSync(join(root, "ticket-auth/jira.enc"));
    expect(encrypted.toString()).not.toContain("fixture-access");
    if (process.platform !== "win32") expect(statSync(join(root, "ticket-auth/jira.enc")).mode & 0o777).toBe(0o600);
  });
  it("does not resurrect credentials when disconnected during code exchange", async () => {
    const url = new URL(await auth.beginJiraOAuth("https://example.atlassian.net"));
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json([{ id: "cloud-id", url: "https://example.atlassian.net" }]));
    const result = deliver(`/callback?state=${url.searchParams.get("state")}&code=fixture`);
    expect(auth.jiraConnecting()).toBe(true);
    auth.disconnectJira();
    finish(Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 }));
    expect((await result).status).toBe(400);
    expect(credentials.readTicketCredentials()).toBeNull();
  });
  it("serializes rotating-token refresh and keeps tokens out of provider error messages", async () => {
    credentials.writeTicketCredentials({ accessToken: "expired", refreshToken: "old", expiresAt: 0, cloudId: "cloud-id", workspaceUrl: "https://example.atlassian.net" });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 })).mockImplementation(async () => Response.json({ ok: true }));
    await Promise.all([auth.jiraRequest("myself"), auth.jiraRequest("myself")]);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("oauth/token"))).toHaveLength(1);
    expect(credentials.readTicketCredentials()?.refreshToken).toBe("rotated");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private provider diagnostics", { status: 400 }));
    await expect(auth.jiraRequest("myself")).rejects.not.toThrow("private provider diagnostics");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("private provider diagnostics", { status: 200 }));
    await expect(auth.jiraRequest("myself")).rejects.toThrow("unreadable response");
  });
});
