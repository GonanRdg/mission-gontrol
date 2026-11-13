import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { DEFAULT_TICKET_FILTERS, matchTicket, type TicketConnection, type TicketDetail, type TicketFilters, type TicketOption, type TicketPage, type TicketPatch, type TicketProvider, type TicketSummary } from "~/shared/tickets";
import { findProjectById } from "../repositories/projects.repo";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../errors";
import { getSetting, setSetting } from "./settings";
import { spawnCapture } from "./_spawn";
import { beginJiraOAuth, disconnectJira, jiraConnected, jiraConnecting, jiraOAuthConfigured, jiraRequest, ticketJson } from "./ticket-oauth";

const connectionKey = "ticket_connection";
const projectKey = (id: string, provider: TicketProvider) => `ticket_filters:${provider}:${id}`;
const repositorySchema = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/).max(240);
export const ticketFiltersSchema = z.object({
  project: z.string().max(100).regex(/^[a-zA-Z0-9_-]*$/), repository: z.union([repositorySchema, z.literal("")]),
  keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  title: z.boolean(), description: z.boolean(), labels: z.boolean(), field: z.boolean(),
  fieldId: z.string().max(100).regex(/^(customfield_\d+|components|repository)?$/), ancestors: z.boolean(),
}).refine(value => value.title || value.description || value.labels || value.field, "Choose at least one location to search");
export const ticketConnectionSchema = z.object({ provider: z.enum(["jira", "github"]), workspaceUrl: z.string().max(500) });
export const ticketPatchSchema = z.object({ title: z.string().trim().min(1).max(255).optional(), description: z.string().max(200_000).optional(), transitionId: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100).optional() }).strict();
export const ticketCommentSchema = z.object({ body: z.string().trim().min(1).max(100_000), commentId: z.string().regex(/^\d+$/).optional() }).strict();
export const ticketContextSchema = z.string().regex(/^[a-f0-9]{64}$/);

export function ticketConnectionConfig(): { provider: TicketProvider; workspaceUrl: string } {
  try { return ticketConnectionSchema.parse(JSON.parse(getSetting(connectionKey) ?? "null")); }
  catch { return { provider: "jira", workspaceUrl: "" }; }
}
export function saveTicketConnection(value: { provider: TicketProvider; workspaceUrl: string }) {
  const parsed = ticketConnectionSchema.parse(value);
  if (parsed.provider === "jira") {
    let url: URL;
    try { url = new URL(parsed.workspaceUrl); } catch { throw new ValidationError("Enter the root URL of your company Jira."); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !url.hostname.endsWith(".atlassian.net")) throw new ValidationError("Use your Jira Cloud root, such as https://company.atlassian.net.");
    parsed.workspaceUrl = url.origin;
  } else parsed.workspaceUrl = "https://github.com";
  const previous = ticketConnectionConfig();
  if (previous.provider !== parsed.provider || previous.workspaceUrl !== parsed.workspaceUrl) disconnectJira();
  setSetting(connectionKey, JSON.stringify(parsed));
}
function requireProject(id: string) {
  const project = findProjectById(id);
  if (!project) throw new NotFoundError("Repository not found");
  return project;
}
export function getTicketFilters(projectId: string): TicketFilters {
  const project = requireProject(projectId);
  const provider = ticketConnectionConfig().provider;
  try { return ticketFiltersSchema.parse(JSON.parse(getSetting(projectKey(projectId, provider)) ?? "null")); }
  catch {
    return { ...DEFAULT_TICKET_FILTERS, keywords: [project.name], fieldId: provider === "github" ? "repository" : "" };
  }
}
export function saveTicketFilters(projectId: string, value: TicketFilters) {
  requireProject(projectId);
  const filters = ticketFiltersSchema.parse(value);
  if (ticketConnectionConfig().provider === "jira" && !filters.project) throw new ValidationError("Choose a Jira project.");
  if (ticketConnectionConfig().provider === "github" && !filters.repository) throw new ValidationError("Choose a GitHub repository.");
  setSetting(projectKey(projectId, ticketConnectionConfig().provider), JSON.stringify(filters));
}
let githubLogin: { code: string; child: ReturnType<typeof spawn>; timer: ReturnType<typeof setTimeout> } | null = null;
async function githubToken(): Promise<string> {
  const result = await spawnCapture("gh", ["auth", "token", "--hostname", "github.com"], { cwd: process.cwd(), timeoutMs: 10_000, enoentCode: 127, onTimeout: () => new ValidationError("GitHub CLI is unavailable.") });
  if (result.code || !result.stdout.trim()) throw new UnauthorizedError("Connect GitHub using GitHub CLI.");
  return result.stdout.trim();
}
export async function getTicketConnection(): Promise<TicketConnection> {
  const config = ticketConnectionConfig();
  let connected = false;
  if (config.provider === "jira") connected = jiraConnected(config.workspaceUrl);
  else { try { await githubToken(); connected = true; } catch { /* An absent CLI account is a disconnected source. */ } }
  return { ...config, connected, oauthConfigured: config.provider === "github" || jiraOAuthConfigured(), connecting: config.provider === "jira" ? jiraConnecting() : !!githubLogin };
}
export async function connectTickets(): Promise<{ url: string; code?: string }> {
  const config = ticketConnectionConfig();
  if (config.provider === "jira") return { url: await beginJiraOAuth(config.workspaceUrl) };
  if (githubLogin) return { url: "https://github.com/login/device", code: githubLogin.code };
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https", "--scopes", "repo"], { env: { ...process.env, GH_BROWSER: "echo" }, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", settled = false;
    const timer = setTimeout(() => { child.kill(); githubLogin = null; if (!settled) reject(new ValidationError("GitHub sign-in timed out.")); }, 5 * 60_000); timer.unref();
    const onData = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8_000);
      const code = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
      if (!settled && code) { settled = true; githubLogin = { code, child, timer }; child.stdin.write("\n"); resolve({ url: "https://github.com/login/device", code }); }
    };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    const finish = () => { clearTimeout(timer); githubLogin = null; if (!settled) { settled = true; reject(new ValidationError("GitHub sign-in could not start. Install GitHub CLI and retry.")); } };
    child.once("error", finish); child.once("close", finish);
  });
}
export function disconnectTickets() { disconnectJira(); }
async function githubRequest(path: string, init?: RequestInit, missingIsNull = false) {
  return ticketJson(`https://api.github.com/${path}`, { ...init, headers: { accept: "application/vnd.github+json", "content-type": "application/json", "X-GitHub-Api-Version": "2022-11-28", ...init?.headers, authorization: `Bearer ${await githubToken()}` } }, missingIsNull);
}
function repository(filters: TicketFilters) { return repositorySchema.parse(filters.repository); }
export async function ticketProjects(query = ""): Promise<TicketOption[]> {
  if (ticketConnectionConfig().provider === "jira") {
    const result = await jiraRequest(`project/search?maxResults=100&query=${encodeURIComponent(query)}`);
    return result.values.map((item: any) => ({ id: item.key, name: `${item.name} (${item.key})` }));
  }
  const result = query ? (await githubRequest(`search/repositories?q=${encodeURIComponent(`${query} in:name fork:true`)}&per_page=100`)).items : await githubRequest("user/repos?per_page=100&sort=pushed");
  return result.map((item: any) => ({ id: item.full_name, name: item.full_name }));
}
export async function ticketFields(projectId: string, projectKey?: string): Promise<TicketOption[]> {
  const filters = getTicketFilters(projectId);
  if (ticketConnectionConfig().provider === "github") return [{ id: "repository", name: "Repository" }];
  const key = projectKey ?? filters.project;
  if (!key) return [];
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new ValidationError("Invalid Jira project");
  const project = await jiraRequest(`project/${encodeURIComponent(key)}`);
  const result = await jiraRequest(`field/search?maxResults=100&projectIds=${encodeURIComponent(project.id)}`);
  return result.values.filter((item: any) => /^(customfield_\d+|components)$/.test(item.id)).map((item: any) => ({ id: item.id, name: `${item.name}${item.schema?.custom ? " · Custom field" : ""}` }));
}
export function jiraText(value: any): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (value.type === "text") return value.text ?? "";
  if (value.type === "hardBreak") return "\n";
  if (value.type === "mention") return value.attrs?.text ?? "";
  if (value.type === "inlineCard") return value.attrs?.url ?? "";
  const content = (value.content ?? []).map(jiraText).join("");
  return content + (["paragraph", "heading", "listItem"].includes(value.type) ? "\n" : "");
}
export function jiraDocument(text: string) {
  return { type: "doc", version: 1, content: text.split(/\r?\n/).map(line => ({ type: "paragraph", content: line ? [{ type: "text", text: line }] : [] })) };
}
function fieldValues(value: any): string[] {
  if (Array.isArray(value)) return value.flatMap(fieldValues);
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (value && typeof value === "object") return fieldValues(value.value ?? value.name ?? value.displayName ?? "");
  return [];
}
export function jiraSummary(issue: any, filters: TicketFilters): TicketSummary {
  const fields = issue.fields ?? {};
  return { id: issue.key, key: issue.key, title: fields.summary ?? "", description: jiraText(fields.description).trimEnd(), url: `${ticketConnectionConfig().workspaceUrl}/browse/${issue.key}`,
    status: fields.status?.name ?? "Unknown", done: fields.status?.statusCategory?.key === "done", type: fields.issuetype?.name ?? "Ticket", priority: fields.priority?.name ?? "", assignee: fields.assignee?.displayName ?? null,
    labels: fields.labels ?? [], parentId: fields.parent?.key ?? null, metadata: filters.fieldId ? fieldValues(fields[filters.fieldId]) : [] };
}
function githubSummary(issue: any, filters: TicketFilters): TicketSummary {
  const actualRepo = /^https:\/\/api\.github\.com\/repos\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/.exec(issue.repository_url ?? "")?.[1] ?? repository(filters);
  return { id: String(issue.number), key: `#${issue.number}`, title: issue.title ?? "", description: issue.body ?? "", url: `https://github.com/${actualRepo}/issues/${issue.number}`,
    status: issue.state === "closed" ? "Closed" : "Open", done: issue.state === "closed", type: issue.type?.name ?? "Issue", priority: "", assignee: issue.assignee?.login ?? null,
    labels: (issue.labels ?? []).map((label: any) => typeof label === "string" ? label : label.name), parentId: null, metadata: [actualRepo, actualRepo.split("/")[1]] };
}
function jiraFields(filters: TicketFilters) { return [...new Set(["project", "summary", "description", "status", "issuetype", "priority", "assignee", "labels", "parent", ...(filters.fieldId ? [filters.fieldId] : [])])]; }
function issueId(value: string, provider: TicketProvider): string {
  if (!(provider === "jira" ? /^[A-Z][A-Z0-9_]*-\d+$/i : /^\d+$/).test(value)) throw new ValidationError("Invalid ticket identifier");
  return value;
}
export async function listTickets(projectId: string, cursor?: string, override?: TicketFilters): Promise<TicketPage> {
  const context = ticketContext(projectId);
  const filters = override ? ticketFiltersSchema.parse(override) : getTicketFilters(projectId);
  requireProject(projectId);
  const cursorContext = createHash("sha256").update(JSON.stringify([context, filters])).digest("hex");
  let pageToken: string | undefined;
  if (cursor) {
    try {
      const decoded = z.object({ context: ticketContextSchema, token: z.string().min(1).max(8000) }).parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      if (decoded.context !== cursorContext) throw new Error("stale cursor");
      pageToken = decoded.token;
    } catch { throw new ConflictError("Ticket search changed. Refresh before loading more tickets."); }
  }
  const jira = ticketConnectionConfig().provider === "jira";
  let items: TicketSummary[], nextCursor: string | null;
  if (jira) {
    if (!filters.project) throw new ValidationError("Choose a project in Ticket settings.");
    const result = await jiraRequest("search/jql", { method: "POST", body: JSON.stringify({ jql: `project = "${filters.project}" AND statusCategory != Done ORDER BY updated DESC`, fields: jiraFields(filters), maxResults: 100, ...(pageToken ? { nextPageToken: pageToken } : {}) }) });
    items = result.issues.map((item: any) => jiraSummary(item, filters)); nextCursor = result.isLast ? null : result.nextPageToken ?? null;
  } else {
    const page = pageToken ? Number(pageToken) : 1;
    if (!Number.isInteger(page) || page < 1 || page > 1000) throw new ValidationError("Invalid ticket page");
    const result = await githubRequest(`repos/${repository(filters)}/issues?state=open&sort=updated&per_page=100&page=${page}`);
    items = result.filter((item: any) => !item.pull_request).map((item: any) => githubSummary(item, filters)); nextCursor = result.length === 100 ? String(page + 1) : null;
  }
  const ancestors = new Map(items.map(item => [item.id, item]));
  let ancestorLimited = false;
  if (filters.ancestors && jira) {
    for (let depth = 0; depth < 8; depth++) {
      const missing = [...new Set([...ancestors.values()].map(item => item.parentId).filter((id): id is string => !!id && !ancestors.has(id)))];
      if (!missing.length) break;
      if (ancestors.size + missing.length > 500) { ancestorLimited = true; break; }
      missing.forEach(id => issueId(id, "jira"));
      const result = await jiraRequest("search/jql", { method: "POST", body: JSON.stringify({ jql: `key in (${missing.map(id => `"${id}"`).join(",")})`, fields: jiraFields(filters), maxResults: 100 }) });
      for (const raw of result.issues) { const item = jiraSummary(raw, filters); ancestors.set(item.id, item); }
      if (result.issues.length < missing.length || depth === 7) { ancestorLimited = true; break; }
    }
  }
  if (filters.ancestors && !jira) {
    let lookups = 0;
    const cache = new Map<string, TicketSummary | null>();
    for (const item of items) {
      if (matchTicket(item, { ...filters, ancestors: false })) continue;
      let child = item;
      for (let depth = 0; depth < 8; depth++) {
        const path = new URL(child.url).pathname.replace(/^\//, "");
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/issues\/\d+$/.test(path)) break;
        if (!cache.has(path)) {
          if (++lookups > 64) { ancestorLimited = true; break; }
          const raw = await githubRequest(`repos/${path}/parent`, undefined, true);
          const parent = raw ? githubSummary(raw, filters) : null;
          if (parent) parent.id = parent.url;
          cache.set(path, parent);
        }
        const parent = cache.get(path);
        if (!parent) break;
        child.parentId = parent.id; ancestors.set(parent.id, parent);
        if (matchTicket(parent, { ...filters, ancestors: false })) break;
        child = parent;
        if (depth === 7) ancestorLimited = true;
      }
    }
  }
  assertTicketContext(projectId, context);
  return { context, tickets: items.flatMap(item => { const match = matchTicket(item, filters, ancestors); return match ? [{ ...item, match }] : []; }), nextCursor: nextCursor ? Buffer.from(JSON.stringify({ context: cursorContext, token: nextCursor })).toString("base64url") : null, scanned: items.length, ancestorLimited };
}
export async function ticketDetail(projectId: string, id: string, expectedContext?: string): Promise<TicketDetail> {
  const context = ticketContext(projectId);
  if (expectedContext) assertTicketContext(projectId, expectedContext);
  const filters = getTicketFilters(projectId), provider = ticketConnectionConfig().provider;
  issueId(id, provider);
  if (provider === "jira") {
    const [issue, transitions, comments, permissions, viewer] = await Promise.all([
      jiraRequest(`issue/${id}?fields=${jiraFields(filters).join(",")}`), jiraRequest(`issue/${id}/transitions`),
      jiraRequest(`issue/${id}/comment?maxResults=100&orderBy=-created`),
      jiraRequest(`mypermissions?issueKey=${id}&permissions=EDIT_ISSUES,ADD_COMMENTS`), jiraRequest("myself"),
    ]);
    if (issue.fields?.project?.key && issue.fields.project.key !== filters.project) throw new NotFoundError("Ticket not found in this project");
    assertTicketContext(projectId, context);
    return { context, ...jiraSummary(issue, filters), transitions: transitions.transitions.map((item: any) => ({ id: item.id, name: item.name })), canEdit: !!permissions.permissions?.EDIT_ISSUES?.havePermission, canComment: !!permissions.permissions?.ADD_COMMENTS?.havePermission,
      comments: comments.comments.map((item: any) => { const own = item.author?.accountId === viewer.accountId; const rich = !isPlainJiraComment(item.body); return { id: item.id, body: jiraText(item.body).trimEnd(), author: item.author?.displayName ?? "Unknown", editable: own && !rich, editExternally: own && rich, updatedAt: item.updated }; }), commentsLimited: comments.total > comments.comments.length };
  }
  const base = `repos/${repository(filters)}`;
  const [issue, comments, repo, viewer] = await Promise.all([githubRequest(`${base}/issues/${id}`), githubRequest(`${base}/issues/${id}/comments?per_page=100`), githubRequest(base), githubRequest("user")]);
  if (issue.pull_request) throw new NotFoundError("Ticket not found");
  const canEdit = issue.user?.login === viewer.login || repo.permissions?.push === true;
  assertTicketContext(projectId, context);
  return { context, ...githubSummary(issue, filters), canEdit, canComment: !issue.locked || repo.permissions?.push === true,
    transitions: canEdit ? [{ id: issue.state === "closed" ? "open" : "closed", name: issue.state === "closed" ? "Reopen" : "Close" }] : [],
    comments: comments.map((item: any) => ({ id: String(item.id), body: item.body ?? "", author: item.user?.login ?? "Unknown", editable: item.user?.login === viewer.login, updatedAt: item.updated_at })), commentsLimited: issue.comments > comments.length };
}
export async function updateTicket(projectId: string, id: string, patch: TicketPatch, expectedContext: string): Promise<void> {
  assertTicketContext(projectId, expectedContext);
  const assertContext = mutationContext(projectId);
  const filters = getTicketFilters(projectId), provider = ticketConnectionConfig().provider;
  issueId(id, provider); ticketPatchSchema.parse(patch);
  const detail = await ticketDetail(projectId, id);
  assertContext();
  if ((patch.title !== undefined || patch.description !== undefined) && !detail.canEdit) throw new NotFoundError("Ticket cannot be edited");
  if (patch.transitionId && !detail.transitions.some(item => item.id === patch.transitionId)) throw new ValidationError("Transition is unavailable. Refresh this ticket.");
  if (provider === "jira") {
    const fields = { ...(patch.title !== undefined ? { summary: patch.title } : {}), ...(patch.description !== undefined ? { description: jiraDocument(patch.description) } : {}) };
    if (Object.keys(fields).length) await jiraRequest(`issue/${id}`, { method: "PUT", body: JSON.stringify({ fields }) });
    if (patch.transitionId) { assertContext(); await jiraRequest(`issue/${id}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: patch.transitionId } }) }); }
  } else await githubRequest(`repos/${repository(filters)}/issues/${id}`, { method: "PATCH", body: JSON.stringify({ ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { body: patch.description } : {}), ...(patch.transitionId ? { state: patch.transitionId } : {}) }) });
}
export async function saveTicketComment(projectId: string, id: string, body: string, expectedContext: string, commentId?: string): Promise<void> {
  assertTicketContext(projectId, expectedContext);
  const assertContext = mutationContext(projectId);
  const filters = getTicketFilters(projectId), provider = ticketConnectionConfig().provider;
  issueId(id, provider); ticketCommentSchema.parse({ body, commentId });
  const detail = await ticketDetail(projectId, id);
  assertContext();
  if (commentId ? !detail.comments.some(item => item.id === commentId && item.editable) : !detail.canComment) throw new NotFoundError("Comment is unavailable for editing");
  if (provider === "jira") await jiraRequest(`issue/${id}/comment${commentId ? `/${commentId}` : ""}`, { method: commentId ? "PUT" : "POST", body: JSON.stringify({ body: jiraDocument(body) }) });
  else await githubRequest(`repos/${repository(filters)}/issues/${commentId ? `comments/${commentId}` : `${id}/comments`}`, { method: commentId ? "PATCH" : "POST", body: JSON.stringify({ body }) });
}
function mutationContext(projectId: string) {
  const snapshot = ticketContext(projectId);
  return () => assertTicketContext(projectId, snapshot);
}
export function ticketContext(projectId: string): string {
  return createHash("sha256").update(JSON.stringify([ticketConnectionConfig(), getTicketFilters(projectId)])).digest("hex");
}
function assertTicketContext(projectId: string, expected: string) {
  if (!ticketContextSchema.safeParse(expected).success || ticketContext(projectId) !== expected) throw new ConflictError("Ticket source or repo filters changed. Reopen the ticket before saving.");
}
function isPlainJiraComment(document: any): boolean {
  return document?.type === "doc" && (document.content ?? []).every((paragraph: any) => paragraph.type === "paragraph" && !paragraph.attrs && (paragraph.content ?? []).every((node: any) => node.type === "text" && !node.marks?.length && !node.attrs));
}
