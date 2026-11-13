import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { clearTicketCredentials, readTicketCredentials, writeTicketCredentials } from "./ticket-credentials";
import { UnauthorizedError, ValidationError } from "../errors";

export const JIRA_CALLBACK_URL = "http://127.0.0.1:53683/callback";
let pending: { server: Server; state: string; workspaceUrl: string; timer: ReturnType<typeof setTimeout> } | null = null;
let refreshing: Promise<string> | null = null;
let generation = 0;
let completing = 0;

export function jiraOAuthConfigured(): boolean {
  return !!(process.env.MC_JIRA_OAUTH_CLIENT_ID && process.env.MC_JIRA_OAUTH_CLIENT_SECRET);
}
export function jiraConnecting(): boolean { return pending !== null || (completing !== 0 && completing === generation); }
export function jiraConnected(workspaceUrl: string): boolean {
  try { return readTicketCredentials()?.workspaceUrl === workspaceUrl; } catch { return false; }
}
export async function ticketJson(url: string, init?: RequestInit, missingIsNull = false): Promise<any> {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000), redirect: "error" }); }
  catch { throw new ValidationError("Ticket provider is unavailable. Retry the request."); }
  if (response.status === 404 && missingIsNull) return null;
  if (response.status === 401) throw new UnauthorizedError("Reconnect your ticket provider.");
  if (!response.ok) {
    if (response.status === 429) throw new ValidationError("Ticket provider rate limit reached. Retry later.");
    if (response.status === 404 || response.status === 403) throw new ValidationError("Ticket or operation is unavailable to this account.");
    if (response.status === 409) throw new ValidationError("The ticket changed. Refresh before saving again.");
    throw new ValidationError("Ticket provider rejected the request. Check the fields and your permissions.");
  }
  if (response.status === 204) return null;
  try { return await response.json(); } catch { throw new ValidationError("Ticket provider returned an unreadable response. Retry later."); }
}
async function exchange(body: Record<string, string>) {
  return ticketJson("https://auth.atlassian.com/oauth/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, client_id: process.env.MC_JIRA_OAUTH_CLIENT_ID, client_secret: process.env.MC_JIRA_OAUTH_CLIENT_SECRET }),
  });
}
function stopPending() {
  if (!pending) return;
  clearTimeout(pending.timer); pending.server.close(); pending = null;
}
export function disconnectJira() { generation++; stopPending(); clearTicketCredentials(); }

export async function beginJiraOAuth(workspaceUrl: string): Promise<string> {
  if (!jiraOAuthConfigured()) throw new ValidationError("Jira OAuth is not configured for this build. See the ticket integration setup guide.");
  stopPending();
  const attempt = ++generation;
  const state = randomBytes(32).toString("hex");
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", JIRA_CALLBACK_URL);
      const received = Buffer.from(url.searchParams.get("state") ?? "");
      const expected = Buffer.from(state);
      if (request.method !== "GET" || url.pathname !== "/callback" || received.length !== expected.length || !timingSafeEqual(received, expected) || pending?.state !== state) {
        response.writeHead(400); response.end("Invalid authorization callback."); return;
      }
      // Consume the nonce before exchanging the code, including concurrent callback requests.
      completing = attempt;
      stopPending();
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader("content-security-policy", "default-src 'none'");
      try {
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.has("error")) throw new Error("denied");
        const token = await exchange({ grant_type: "authorization_code", code, redirect_uri: JIRA_CALLBACK_URL });
        if (typeof token.access_token !== "string" || typeof token.refresh_token !== "string") throw new Error("invalid token");
        const resources = await ticketJson("https://api.atlassian.com/oauth/token/accessible-resources", { headers: { authorization: `Bearer ${token.access_token}` } });
        const resource = (resources as { id: string; url: string }[]).find(item => item.url.replace(/\/$/, "") === workspaceUrl);
        if (!resource || !/^[a-zA-Z0-9-]+$/.test(resource.id)) throw new Error("site unavailable");
        if (attempt !== generation) throw new Error("connection cancelled");
        writeTicketCredentials({ accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + Number(token.expires_in ?? 3600) * 1000, cloudId: resource.id, workspaceUrl });
        response.end("<!doctype html><title>Connected</title><h1>Jira connected</h1><p>Return to Mission Gontrol. You can close this window.</p>");
      } catch {
        response.statusCode = 400;
        response.end("<!doctype html><title>Connection failed</title><h1>Jira connection failed</h1><p>Check your account and selected Jira site, then reconnect from Mission Gontrol.</p>");
      } finally {
        if (completing === attempt) completing = 0;
      }
    })().catch(() => { if (!response.writableEnded) { response.statusCode = 500; response.end("Connection failed."); } });
  });
  await new Promise<void>((resolve, reject) => {
    const onError = () => reject(new ValidationError("The Jira callback port is unavailable. Close another connection attempt and retry."));
    server.once("error", onError);
    server.listen(53683, "127.0.0.1", () => { server.off("error", onError); resolve(); });
  });
  const timer = setTimeout(stopPending, 10 * 60_000); timer.unref(); server.unref();
  pending = { server, state, workspaceUrl, timer };
  const url = new URL("https://auth.atlassian.com/authorize");
  url.search = new URLSearchParams({ audience: "api.atlassian.com", client_id: process.env.MC_JIRA_OAUTH_CLIENT_ID!, scope: "read:jira-work read:jira-user write:jira-work offline_access", redirect_uri: JIRA_CALLBACK_URL, state, response_type: "code", prompt: "consent" }).toString();
  return url.href;
}

export async function jiraRequest(path: string, init?: RequestInit): Promise<any> {
  let credentials = readTicketCredentials();
  if (!credentials) throw new UnauthorizedError("Connect Jira in Ticket settings.");
  if (credentials.expiresAt < Date.now() + 60_000) {
    refreshing ??= (async () => {
      const current = readTicketCredentials();
      const attempt = generation;
      if (!current) throw new UnauthorizedError("Reconnect Jira.");
      const next = await exchange({ grant_type: "refresh_token", refresh_token: current.refreshToken });
      if (typeof next.access_token !== "string" || typeof next.refresh_token !== "string") throw new UnauthorizedError("Reconnect Jira.");
      if (attempt !== generation) throw new UnauthorizedError("Jira connection changed. Reconnect.");
      writeTicketCredentials({ ...current, accessToken: next.access_token, refreshToken: next.refresh_token, expiresAt: Date.now() + Number(next.expires_in ?? 3600) * 1000 });
      return next.access_token as string;
    })().finally(() => { refreshing = null; });
    await refreshing; credentials = readTicketCredentials();
    if (!credentials) throw new UnauthorizedError("Reconnect Jira.");
  }
  return ticketJson(`https://api.atlassian.com/ex/jira/${credentials.cloudId}/rest/api/3/${path}`, {
    ...init, headers: { "content-type": "application/json", ...init?.headers, authorization: `Bearer ${credentials.accessToken}` },
  });
}
