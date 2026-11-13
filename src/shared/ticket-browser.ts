export type TicketBrowserSettings = {
  workspaceUrl: string;
  project: string;
  keywords: string;
  title: boolean;
  description: boolean;
  pendingOnly: boolean;
};
export const DEFAULT_TICKET_BROWSER_SETTINGS: TicketBrowserSettings = {
  workspaceUrl: "", project: "", keywords: "", title: true, description: true, pendingOnly: true,
};
export const TICKET_BROWSER_PARTITION = "persist:ticket-browser";
export function isJiraSite(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /^[a-z0-9-]+\.atlassian\.net$/.test(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}
export function ticketSearchUrl(settings: TicketBrowserSettings): string | null {
  if (!isJiraSite(settings.workspaceUrl) || !settings.project.trim() || !settings.keywords.trim() || !(settings.title || settings.description)) return null;
  const quote = (value: string) => JSON.stringify(value.trim());
  const locations = [settings.title && `summary ~ ${quote(settings.keywords)}`, settings.description && `description ~ ${quote(settings.keywords)}`].filter(Boolean);
  const jql = [`project = ${quote(settings.project)}`, settings.pendingOnly && "statusCategory != Done", `(${locations.join(" OR ")})`].filter(Boolean).join(" AND ");
  const url = new URL("/issues", settings.workspaceUrl);
  url.searchParams.set("jql", `${jql} ORDER BY updated DESC`);
  return url.href;
}
export function selectedTicketUrl(raw: string, site: string): string | null {
  if (!isJiraSite(site)) return null;
  try {
    const url = new URL(raw);
    if (url.origin !== new URL(site).origin || !isJiraSite(raw)) return null;
    const path = /\/(?:browse|issues)\/([A-Z][A-Z0-9_]*-[1-9]\d*)(?:\/|$)/i.exec(url.pathname)?.[1];
    const selected = url.searchParams.get("selectedIssue");
    const key = selected && /^[A-Z][A-Z0-9_]*-[1-9]\d*$/i.test(selected) ? selected : path;
    return key ? `${url.origin}/browse/${key.toUpperCase()}` : null;
  } catch { return null; }
}
