import { useEffect, useId, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Btn } from "~/components/ui/Btn";
import { api } from "~/lib/api";
import { openExternal } from "~/lib/open-external";
import { ticketKeys, useTicketConnection } from "~/lib/tickets";
import { useScopedProjects } from "~/queries";
import { type TicketConnection, type TicketFilters, type TicketProvider } from "~/shared/tickets";
import { ticketSearchUrl, type TicketBrowserSettings } from "~/shared/ticket-browser";
import "./tickets.css";

const message = (error: unknown) => error instanceof Error ? error.message : "Ticket settings request failed.";
function Field({ label, hint, children, id }: { label: string; hint: string; children: ReactNode; id: string }) {
  return <div className="mc-ticket-setting-field"><label htmlFor={id}>{label}</label>{children}<p className="mc-ticket-hint" id={`${id}-hint`}>{hint}</p></div>;
}
export function TicketSettingsPage({ activeProjectId }: { activeProjectId?: string | null }) {
  const connection = useTicketConnection();
  const { data: projects = [] } = useScopedProjects();
  const [projectId, setProjectId] = useState(() => activeProjectId ?? (typeof window === "undefined" ? "" : window.localStorage.getItem("mc-ticket-settings-project") ?? ""));
  const selectedProject = projects.find(project => project.id === projectId) ?? projects[0];
  useEffect(() => { if (selectedProject) window.localStorage.setItem("mc-ticket-settings-project", selectedProject.id); }, [selectedProject?.id]);
  return <section className="mc-ticket-settings"><h2>Tickets</h2><p>Each Mission Gontrol project keeps its own ticket source and filters. Jira uses your browser sign-in.</p>
    {connection.isPending ? <p role="status">Loading ticket settings…</p> : connection.error ? <p role="alert">{message(connection.error)} <Btn variant="ghost" size="sm" onClick={() => void connection.refetch()}>Retry</Btn></p> : connection.data && <>
      <TicketProviderForm connection={connection.data} />
      {connection.data.provider === "github" && <TicketAccount connection={connection.data} />}
      <fieldset><legend>Project filters <small>{selectedProject?.name ?? "Choose a project"}</small></legend>
        <Field id="ticket-local-project" label="Mission Gontrol project" hint="Starts with your open project. The Jira site, project, and search terms or GitHub repository filters below are saved only for this selection. Switching projects in the app loads that project’s filters."><select id="ticket-local-project" name="localProject" aria-describedby="ticket-local-project-hint" value={selectedProject?.id ?? ""} onChange={event => setProjectId(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
        {selectedProject ? connection.data.provider === "jira" ? <JiraBrowserSettings key={selectedProject.id} projectId={selectedProject.id} /> : <TicketRepoSettings key={`${selectedProject.id}:${connection.data.provider}`} projectId={selectedProject.id} connection={connection.data} /> : <p className="mc-ticket-hint">Add a repository to configure ticket filters.</p>}
      </fieldset>
    </>}
  </section>;
}
function TicketProviderForm({ connection }: { connection: TicketConnection }) {
  const client = useQueryClient();
  const [provider, setProvider] = useState<TicketProvider>(connection.provider);
  useEffect(() => setProvider(connection.provider), [connection.provider]);
  const save = useMutation({ mutationFn: () => api.saveTicketConnection({ provider, workspaceUrl: provider === "jira" ? "" : "https://github.com" }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ticketKeys.all }); toast.success("Ticket application saved"); } });
  return <form onSubmit={event => { event.preventDefault(); save.mutate(); }} aria-label="Ticket application">
    <Field id="ticket-provider" label="Ticket application" hint="Applies to the ticket button throughout the app. Search filters below belong to individual projects."><select id="ticket-provider" name="provider" value={provider} onChange={event => setProvider(event.target.value as TicketProvider)} aria-describedby="ticket-provider-hint"><option value="jira">Jira browser</option><option value="github">GitHub Issues</option></select></Field>
    <div className="mc-ticket-actions"><Btn type="submit" variant="ghost" size="sm" disabled={save.isPending || provider === connection.provider}>Save application</Btn></div>
    {save.error && <p role="alert" className="mc-ticket-error">{message(save.error)}</p>}
  </form>;
}
function TicketAccount({ connection }: { connection: TicketConnection }) {
  const client = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const connect = useMutation({ mutationFn: api.connectTickets, onSuccess: async result => { setCode(result.code ?? null); openExternal(result.url); await client.invalidateQueries({ queryKey: ticketKeys.all }); } });
  return <fieldset><legend>GitHub account <small>Application-wide</small></legend><p className="mc-ticket-hint">{connection.connected ? "GitHub CLI is connected." : "Connect the GitHub CLI account on this computer."}</p><Btn variant="ghost" size="sm" disabled={connect.isPending || connection.connected} onClick={() => connect.mutate()}>Connect with GitHub</Btn><Btn variant="ghost" size="sm" onClick={() => void client.invalidateQueries({ queryKey: ticketKeys.connection })}>Refresh connection</Btn>{code && <p role="status">Enter this code in your browser: <strong>{code}</strong></p>}{connect.error && <p role="alert" className="mc-ticket-error">{message(connect.error)}</p>}</fieldset>;
}
function JiraBrowserSettings({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ticketKeys.browser(projectId), queryFn: () => api.ticketBrowserSettings(projectId) });
  return query.data ? <JiraBrowserForm projectId={projectId} initial={query.data} /> : <p role={query.error ? "alert" : "status"}>{query.error ? message(query.error) : "Loading project settings…"}</p>;
}
function JiraBrowserForm({ projectId, initial }: { projectId: string; initial: TicketBrowserSettings }) {
  const [settings, setSettings] = useState(initial);
  const [validation, setValidation] = useState<string | null>(null);
  const client = useQueryClient(), prefix = useId();
  const update = <K extends keyof TicketBrowserSettings>(key: K, value: TicketBrowserSettings[K]) => { setSettings(current => ({ ...current, [key]: value })); setValidation(null); };
  const save = useMutation({ mutationFn: () => api.saveTicketBrowserSettings(projectId, settings), onSuccess: async () => { await client.invalidateQueries({ queryKey: ticketKeys.browser(projectId) }); toast.success("Project ticket settings saved"); } });
  const url = ticketSearchUrl(settings);
  return <form aria-label="Jira browser settings" onSubmit={event => { event.preventDefault(); if (!url) { setValidation("Enter a Jira Cloud site, a project and search text, and choose title or description."); return; } save.mutate(); }}>
    <p className="mc-ticket-hint">Sign in inside the Jira pane with your company account. No API token or OAuth app setup is needed. Jira handles ticket details, status changes, and comments.</p>
    <Field id={`${prefix}-site`} label="Jira workspace URL" hint="Your company Jira Cloud root, such as https://company.atlassian.net. This site is saved only for the selected project."><input id={`${prefix}-site`} name="workspaceUrl" type="url" required value={settings.workspaceUrl} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby={`${prefix}-site-hint`} onChange={event => update("workspaceUrl", event.target.value)} /></Field>
    <Field id={`${prefix}-project`} label="Jira project" hint="Enter the Jira project key or exact name, such as HOPS or Example Project. Results stay inside this Jira project."><input id={`${prefix}-project`} name="project" required maxLength={200} value={settings.project} aria-describedby={`${prefix}-project-hint`} onChange={event => update("project", event.target.value)} /></Field>
    <Field id={`${prefix}-keywords`} label="Search text" hint="A repo name or concept, such as billing service*. Jira’s text search syntax applies; this is one search expression, not a comma-separated list."><input id={`${prefix}-keywords`} name="keywords" required maxLength={2000} value={settings.keywords} aria-describedby={`${prefix}-keywords-hint`} onChange={event => update("keywords", event.target.value)} /></Field>
    <fieldset><legend>Search in</legend><div className="mc-ticket-setting-rules">{([['title', 'Ticket title'], ['description', 'Ticket description']] as const).map(([key, label]) => <div className="mc-ticket-setting-rule" key={key}><input id={`${prefix}-${key}`} name={key} type="checkbox" checked={settings[key]} onChange={event => update(key, event.target.checked)} /><label htmlFor={`${prefix}-${key}`}>{label}</label></div>)}</div><p className="mc-ticket-hint">Choose at least one. Either checked location can match.</p></fieldset>
    <div className="mc-ticket-setting-rules"><div className="mc-ticket-setting-rule"><input id={`${prefix}-pending`} name="pendingOnly" type="checkbox" checked={settings.pendingOnly} onChange={event => update("pendingOnly", event.target.checked)} aria-describedby={`${prefix}-pending-hint`} /><div><label htmlFor={`${prefix}-pending`}>Pending tickets only</label><p className="mc-ticket-hint" id={`${prefix}-pending-hint`}>Exclude Jira’s Done status category. Uncheck to include completed tickets.</p></div></div></div>
    {url && <details className="mc-ticket-query-preview"><summary>Preview Jira search</summary><p>{new URL(url).searchParams.get("jql")}</p><Btn type="button" variant="ghost" size="sm" icon="external-link" onClick={() => openExternal(url)}>Open search in browser</Btn></details>}
    <div className="mc-ticket-actions"><Btn type="button" variant="ghost" size="sm" onClick={() => { setSettings(initial); setValidation(null); }}>Cancel</Btn><Btn type="submit" variant="primary" size="sm" disabled={save.isPending}>Save</Btn></div>
    {(validation || save.error) && <p role="alert" className="mc-ticket-error">{validation ?? message(save.error)}</p>}
  </form>;
}
function TicketRepoSettings({ projectId, connection }: { projectId: string; connection: TicketConnection }) {
  const query = useQuery({ queryKey: ticketKeys.filters(projectId, connection.provider), queryFn: () => api.ticketFilters(projectId) });
  return query.data ? <TicketFilterForm projectId={projectId} connection={connection} initial={query.data} /> : <p role={query.error ? "alert" : "status"}>{query.error ? message(query.error) : "Loading repo filters…"}</p>;
}
function TicketFilterForm({ projectId, connection, initial }: { projectId: string; connection: TicketConnection; initial: TicketFilters }) {
  const client = useQueryClient();
  const [filters, setFilters] = useState(initial);
  const [keywords, setKeywords] = useState(initial.keywords.join(", "));
  const [projectSearch, setProjectSearch] = useState("");
  const [search, setSearch] = useState("");
  const prefix = useId();
  useEffect(() => { const timer = setTimeout(() => setSearch(projectSearch), 300); return () => clearTimeout(timer); }, [projectSearch]);
  const projects = useQuery({ queryKey: ["tickets", "projects", connection.provider, search], queryFn: () => api.ticketProjects(search), enabled: connection.connected, staleTime: 60_000 });
  const fields = useQuery({ queryKey: ["tickets", "fields", projectId, connection.provider, filters.project], queryFn: () => api.ticketFields(projectId, filters.project), enabled: connection.connected && (connection.provider === "github" || !!filters.project), staleTime: 60_000 });
  const draft = (): TicketFilters => ({ ...filters, keywords: keywords.split(/[,\n]/).map(value => value.trim()).filter(Boolean) });
  const save = useMutation({ mutationFn: () => api.saveTicketFilters(projectId, draft()), onSuccess: async () => { await client.invalidateQueries({ queryKey: ticketKeys.all }); toast.success("Ticket filters saved"); } });
  const preview = useMutation({ mutationFn: () => api.previewTickets(projectId, draft()) });
  const update = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => { setFilters(current => ({ ...current, [key]: value })); preview.reset(); };
  function rule(key: "title" | "description" | "labels" | "field" | "ancestors", label: string, hint: string) {
    const id = `${prefix}-${key}`;
    return <div className="mc-ticket-setting-rule"><input id={id} type="checkbox" name={key} checked={filters[key]} onChange={event => update(key, event.target.checked)} aria-describedby={`${id}-hint`} /><div><label htmlFor={id}>{label}</label><p id={`${id}-hint`} className="mc-ticket-hint">{hint}</p></div></div>;
  }
  const sourceKey = connection.provider === "jira" ? filters.project : filters.repository;
  return <form onSubmit={event => { event.preventDefault(); save.mutate(); }} aria-label="Repository ticket filters">
    <Field id={`${prefix}-project-search`} label={connection.provider === "jira" ? "Find a project" : "Find a repository"} hint="Search the projects or repositories available to your connected account. Results are limited to 100; narrow the search to find another."><input id={`${prefix}-project-search`} type="search" value={projectSearch} onChange={event => setProjectSearch(event.target.value)} disabled={!connection.connected} aria-describedby={`${prefix}-project-search-hint`} /></Field>
    <Field id={`${prefix}-project`} label={connection.provider === "jira" ? "Project" : "Repository"} hint={connection.provider === "jira" ? "Discovered after connection. Keywords below filter tickets inside this Jira project." : "Only issues in this GitHub repository are searched. This selection belongs to the local repo."}><select id={`${prefix}-project`} required value={sourceKey} disabled={!connection.connected} aria-describedby={`${prefix}-project-hint`} onChange={event => update(connection.provider === "jira" ? "project" : "repository", event.target.value)}><option value="">Choose {connection.provider === "jira" ? "a project" : "a repository"}</option>{sourceKey && !projects.data?.some(item => item.id === sourceKey) && <option value={sourceKey}>{sourceKey}</option>}{projects.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    {projects.error && <p className="mc-ticket-error" role="alert">{message(projects.error)}</p>}
    <Field id={`${prefix}-keywords`} label="Keywords" hint="Repo names, labels, or phrases separated by commas. Any keyword can match any checked location below. Matching ignores case."><textarea id={`${prefix}-keywords`} name="keywords" required maxLength={6000} value={keywords} aria-describedby={`${prefix}-keywords-hint`} onChange={event => { setKeywords(event.target.value); preview.reset(); }} /></Field>
    <div className="mc-ticket-setting-rules">{rule("title", "Ticket title", "Find a keyword or phrase anywhere in the title.")}{rule("description", "Ticket description", "Find a keyword or phrase anywhere in the description.")}{rule("labels", "Ticket labels", "Match an entire label, ignoring case.")}{rule("field", connection.provider === "jira" ? "Selected metadata field" : "Repository name", connection.provider === "jira" ? "Optional. Match the whole value of a field your team uses to identify repos." : "Match the repository name or owner/name. This can include every issue when your keyword names the repository.")}</div>
    {connection.provider === "jira" && filters.field && <Field id={`${prefix}-field`} label="Field to search" hint="Choose metadata available in this project. A field named Repository is team-defined, not a universal Jira field."><select id={`${prefix}-field`} value={filters.fieldId} aria-describedby={`${prefix}-field-hint`} onChange={event => update("fieldId", event.target.value)}><option value="">No metadata field selected</option>{filters.fieldId && !fields.data?.some(item => item.id === filters.fieldId) && <option value={filters.fieldId}>{filters.fieldId}</option>}{fields.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
    {fields.error && <p className="mc-ticket-error" role="alert">{message(fields.error)}</p>}
    <div className="mc-ticket-setting-rules">{rule("ancestors", "Also check parent stories and epics", "Apply the same keywords and checked locations to ancestors. A matching ancestor includes its child tickets.")}</div>
    <p className="mc-ticket-hint">Example: mission-control on an epic includes its child tickets even when their own descriptions do not mention the repo. Direct matches take precedence.</p>
    <div className="mc-ticket-actions"><Btn type="button" variant="ghost" size="sm" onClick={() => { setFilters(initial); setKeywords(initial.keywords.join(", ")); preview.reset(); }}>Cancel</Btn><Btn type="button" variant="ghost" size="sm" disabled={!connection.connected || preview.isPending || !sourceKey || !draft().keywords.length} onClick={() => preview.mutate()}>Preview matches</Btn><Btn type="submit" variant="primary" size="sm" disabled={save.isPending || !sourceKey || !draft().keywords.length}>Save</Btn></div>
    {(save.error || preview.error) && <p role="alert" className="mc-ticket-error">{message(save.error ?? preview.error)}</p>}
    {preview.data && <section className="mc-ticket-preview" aria-live="polite"><h3>Filter preview</h3><p>{preview.data.tickets.length} matches in {preview.data.scanned} pending tickets searched.{preview.data.nextCursor ? " More tickets remain; the session inbox can search additional pages." : ""}</p><ul>{preview.data.tickets.map(ticket => <li key={ticket.id}>{ticket.key} · {ticket.title}<small>{ticket.match?.location} matches “{ticket.match?.keyword}”{ticket.match?.ancestor ? ` on ${ticket.match.ancestor}` : ""}</small></li>)}</ul><p className="mc-ticket-hint">Preview reads tickets only. Save applies filters to this repo’s ticket pane.</p></section>}
  </form>;
}
