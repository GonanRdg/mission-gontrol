export type TicketProvider = "jira" | "github";
export const TICKET_PROVIDER_LABELS: Record<TicketProvider, string> = { jira: "Jira", github: "GitHub Issues" };
export type TicketFilters = {
  project: string;
  repository: string;
  keywords: string[];
  title: boolean;
  description: boolean;
  labels: boolean;
  field: boolean;
  fieldId: string;
  ancestors: boolean;
};
export const DEFAULT_TICKET_FILTERS: TicketFilters = {
  project: "", repository: "", keywords: [], title: true, description: true,
  labels: true, field: true, fieldId: "", ancestors: true,
};
export type TicketConnection = { provider: TicketProvider; workspaceUrl: string; connected: boolean; oauthConfigured: boolean; connecting: boolean };
export type TicketSettings = { connection: TicketConnection; filters: TicketFilters };
export type TicketMatch = { location: string; keyword: string; ancestor?: string };
export type TicketSummary = {
  id: string; key: string; title: string; description: string; url: string;
  status: string; done: boolean; type: string; priority: string; assignee: string | null;
  labels: string[]; parentId: string | null; metadata: string[]; match?: TicketMatch;
};
export type TicketComment = { id: string; author: string; body: string; editable: boolean; editExternally?: boolean; updatedAt: string };
export type TicketDetail = TicketSummary & {
  context: string;
  comments: TicketComment[]; commentsLimited: boolean;
  transitions: { id: string; name: string }[]; canEdit: boolean; canComment: boolean;
};
export type TicketPage = { context: string; tickets: TicketSummary[]; nextCursor: string | null; scanned: number; ancestorLimited: boolean };
export type TicketOption = { id: string; name: string };
export type TicketPatch = { title?: string; description?: string; transitionId?: string };

export function ticketImplementationPrompt(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || /[\r\n\x00-\x1f]/.test(url)) throw new Error("Invalid ticket URL");
  return `Implement ticket ${parsed.href}`;
}

export function matchTicket(ticket: TicketSummary, filters: TicketFilters, ancestors: ReadonlyMap<string, TicketSummary> = new Map()): TicketMatch | null {
  const keywords = filters.keywords.map(value => value.trim().toLocaleLowerCase()).filter(Boolean);
  const direct = (item: TicketSummary): TicketMatch | null => {
    const exact = (values: string[]) => values.find(value => keywords.includes(value.toLocaleLowerCase()));
    const text = (value: string) => keywords.find(keyword => value.toLocaleLowerCase().includes(keyword));
    const field = filters.field && exact(item.metadata);
    if (field) return { location: "Repository field", keyword: field };
    const label = filters.labels && exact(item.labels);
    if (label) return { location: "Label", keyword: label };
    const title = filters.title && text(item.title);
    if (title) return { location: "Title", keyword: title };
    const description = filters.description && text(item.description);
    return description ? { location: "Description", keyword: description } : null;
  };
  const own = direct(ticket);
  if (own || !filters.ancestors) return own;
  const seen = new Set([ticket.id]);
  let parentId = ticket.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = ancestors.get(parentId);
    if (!parent) break;
    const inherited = direct(parent);
    if (inherited) return { ...inherited, ancestor: parent.key };
    parentId = parent.parentId;
  }
  return null;
}
