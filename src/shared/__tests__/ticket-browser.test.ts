import { describe, expect, it } from "vitest";
import { DEFAULT_TICKET_BROWSER_SETTINGS, isJiraSite, selectedTicketUrl, ticketSearchUrl } from "../ticket-browser";
const settings = { ...DEFAULT_TICKET_BROWSER_SETTINGS, workspaceUrl: "https://example.atlassian.net", project: "Example Project", keywords: "billing service*" };
describe("Jira browser searches", () => {
  it("requires explicit project configuration", () => {
    expect(ticketSearchUrl(DEFAULT_TICKET_BROWSER_SETTINGS)).toBeNull();
    expect(ticketSearchUrl({ ...settings, title: false, description: false })).toBeNull();
  });
  it("encodes the project, search locations, and pending status", () => {
    const url = new URL(ticketSearchUrl(settings)!);
    expect(url.origin).toBe(settings.workspaceUrl);
    expect(url.searchParams.get("jql")).toBe('project = "Example Project" AND statusCategory != Done AND (summary ~ "billing service*" OR description ~ "billing service*") ORDER BY updated DESC');
    const jql = new URL(ticketSearchUrl({ ...settings, title: false, pendingOnly: false })!).searchParams.get("jql")!;
    expect(jql).not.toContain("summary");
    expect(jql).not.toContain("statusCategory");
    expect(jql).toContain('description ~ "billing service*"');
  });
  it("quotes project names and search text as JQL values", () => {
    const project = 'A" OR project = "B';
    const jql = new URL(ticketSearchUrl({ ...settings, project })!).searchParams.get("jql")!;
    expect(jql).toContain(`project = ${JSON.stringify(project)}`);
  });
});
describe("selected Jira ticket links", () => {
  it.each([["/browse/APP-3184", "APP-3184"], ["/issues?jql=fixture&selectedIssue=APP-3184", "APP-3184"], ["/jira/software/c/projects/HOPS/issues/APP-3356", "APP-3356"]])("recognizes %s without reading page content", (path, key) => {
    expect(selectedTicketUrl(`${settings.workspaceUrl}${path}`, settings.workspaceUrl)).toBe(`${settings.workspaceUrl}/browse/${key}`);
  });
  it.each(["https://other.atlassian.net/browse/APP-1", "https://id.atlassian.com/login?selectedIssue=APP-1", "https://example.atlassian.net.evil.test/browse/APP-1", "https://user:secret@example.atlassian.net/browse/APP-1", "https://example.atlassian.net/issues?selectedIssue=APP-1%0Aevil", "https://example.atlassian.net/issues?jql=test"])("ignores untrusted or unselected URLs: %s", url => expect(selectedTicketUrl(url, settings.workspaceUrl)).toBeNull());
  it.each(["http://example.atlassian.net", "https://example.test", "https://example.atlassian.net:8443", "https://name:secret@example.atlassian.net"])("rejects unsafe sites: %s", site => expect(isJiraSite(site)).toBe(false));
});
