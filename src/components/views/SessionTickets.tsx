import { useEffect, useId, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Btn } from "~/components/ui/Btn";
import { Icon } from "~/components/ui/Icon";
import { Tooltip } from "~/components/ui/Tooltip";
import { api } from "~/lib/api";
import { openExternal } from "~/lib/open-external";
import { openTicketSettings, ticketKeys, useTicketConnection } from "~/lib/tickets";
import { TICKET_PROVIDER_LABELS, ticketImplementationPrompt, type TicketMatch, type TicketPatch, type TicketProvider } from "~/shared/tickets";
import "./tickets.css";

type PaneState = { open: boolean; selected: string | null; ratio: number; context?: string };
const sessions = new Map<string, PaneState>();
export function useSessionTickets(sessionId: string) {
  const [state, setState] = useState<PaneState>(() => sessions.get(sessionId) ?? { open: false, selected: null, ratio: .5 });
  useEffect(() => { setState(sessions.get(sessionId) ?? { open: false, selected: null, ratio: .5 }); }, [sessionId]);
  const update = (patch: Partial<PaneState>) => setState(current => { const next = { ...current, ...patch }; sessions.set(sessionId, next); return next; });
  return { ...state, update };
}
export function TicketPaneButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { data } = useTicketConnection();
  const label = TICKET_PROVIDER_LABELS[data?.provider ?? "jira"];
  return <Tooltip content={`${open ? "Hide" : "Show"} ${label} tickets`}><Btn variant="ghost" size="sm" icon="list" aria-label={`${open ? "Hide" : "Show"} ${label} tickets`} aria-expanded={open} aria-pressed={open}
    onClick={onToggle} style={{ flexShrink: 0, color: open ? "var(--accent-ink)" : undefined }}>{label}</Btn></Tooltip>;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Ticket request failed. Retry.";

export function SessionTickets({ projectId, repoName, state, onClose, onPaste }: {
  projectId: string; repoName: string; state: ReturnType<typeof useSessionTickets>; onClose: () => void; onPaste: (text: string) => void;
}) {
  const connection = useTicketConnection();
  const provider = connection.data?.provider ?? "jira";
  const [search, setSearch] = useState("");
  const paneRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const tickets = useInfiniteQuery({ queryKey: ticketKeys.list(projectId, provider), initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.tickets(projectId, pageParam), getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: connection.data?.connected === true, staleTime: 15_000, refetchInterval: 60_000 });
  const all = [...new Map((tickets.data?.pages.flatMap(page => page.tickets) ?? []).map(ticket => [ticket.id, ticket])).values()];
  const context = tickets.data?.pages[0]?.context ?? "";
  useEffect(() => { if (context && context !== state.context) state.update({ context, ...(state.context ? { selected: null } : {}) }); }, [context]);
  const filtered = all.filter(ticket => `${ticket.key} ${ticket.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = (state.context && state.context !== context ? null : state.selected) ?? all[0]?.id ?? null;
  const reason = all.find(ticket => ticket.id === selected)?.match;
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const ratio = state.ratio;
  function resize(clientX: number) {
    const bounds = paneRef.current?.parentElement?.getBoundingClientRect();
    if (bounds) state.update({ ratio: Math.min(.8, Math.max(.25, (bounds.right - clientX) / bounds.width)) });
  }
  return <aside className="mc-ticket-pane" ref={paneRef} style={{ width: `${ratio * 100}%` }} aria-labelledby={titleId}>
    <div className="mc-ticket-divider" role="separator" tabIndex={0} aria-label="Resize ticket pane" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={80} aria-valuenow={Math.round(ratio * 100)}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); state.update({ ratio: Math.min(.8, Math.max(.25, ratio + (event.key === "ArrowLeft" ? .03 : -.03))) }); } }}
      onPointerDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); } }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
    <header className="mc-ticket-header"><div><h3 id={titleId}>{TICKET_PROVIDER_LABELS[provider]} tickets</h3><p>{repoName}</p></div><div className="mc-ticket-actions"><Btn variant="ghost" size="sm" icon="settings" aria-label="Ticket settings" onClick={() => openTicketSettings(projectId)} /><Btn variant="ghost" size="sm" icon="x" aria-label="Hide tickets" onClick={onClose} /></div></header>
    {!connection.data?.connected ? <div className="mc-ticket-empty"><p>{connection.isPending ? "Checking ticket connection…" : connection.error ? errorText(connection.error) : `Connect ${TICKET_PROVIDER_LABELS[provider]} to browse this repo’s tickets.`}</p><Btn size="sm" variant="ghost" onClick={() => openTicketSettings(projectId)}>Ticket settings</Btn></div> : <>
      <search className="mc-ticket-search"><label htmlFor={`${titleId}-search`}>Pending tickets <span>{all.length} matched</span></label><input id={`${titleId}-search`} type="search" placeholder="Search ticket key or title" value={search} onChange={event => setSearch(event.target.value)} /><Btn size="sm" variant="ghost" icon="refresh" aria-label="Refresh tickets" disabled={tickets.isFetching} onClick={() => void tickets.refetch()} /></search>
      <div className="mc-ticket-list" aria-label="Pending tickets" aria-busy={tickets.isFetching}>
        {tickets.isPending && <p className="mc-ticket-empty" role="status">Loading tickets…</p>}
        {tickets.error && <div className="mc-ticket-error" role="alert">{errorText(tickets.error)}<Btn variant="ghost" size="sm" onClick={() => void tickets.refetch()}>Retry</Btn></div>}
        {!tickets.isPending && !tickets.error && !filtered.length && <p className="mc-ticket-empty">{search ? "No tickets match your search." : "No matches in the tickets searched so far. Adjust filters or search more tickets."}</p>}
        {filtered.map(ticket => <button type="button" className="mc-ticket-row" key={ticket.id} aria-pressed={selected === ticket.id} onClick={() => { state.update({ selected: ticket.id }); setCopyFallback(null); }}><span><code>{ticket.key}</code><span>{ticket.type}</span><span className="mc-ticket-status">{ticket.status}</span></span><strong>{ticket.title}</strong></button>)}
        {tickets.hasNextPage && <Btn variant="ghost" size="sm" disabled={tickets.isFetchingNextPage} onClick={() => void tickets.fetchNextPage()}>{tickets.isFetchingNextPage ? "Searching…" : "Search more tickets"}</Btn>}
      </div>
      {tickets.data?.pages.some(page => page.ancestorLimited) && <p className="mc-ticket-notice">Some ancestor matches could not be checked. Narrow the project or refresh.</p>}
      {selected && context ? <TicketReader key={`${projectId}:${provider}:${context}:${selected}`} projectId={projectId} provider={provider} context={context} id={selected} reason={reason} onPaste={onPaste} onCopyFailure={setCopyFallback} /> : <div className="mc-ticket-empty">Choose a ticket to read its description.</div>}
    </>}
    {copyFallback && <div className="mc-ticket-copy" role="status"><label>Copy ticket link<input readOnly value={copyFallback} onFocus={event => event.target.select()} autoFocus /></label><Btn variant="ghost" size="sm" icon="x" aria-label="Close copy fallback" onClick={() => setCopyFallback(null)} /></div>}
  </aside>;
}

function TicketReader({ projectId, provider, context, id, reason, onPaste, onCopyFailure }: {
  projectId: string; provider: TicketProvider; context: string; id: string; reason?: TicketMatch; onPaste: (text: string) => void; onCopyFailure: (url: string) => void;
}) {
  const client = useQueryClient();
  const detail = useQuery({ queryKey: ticketKeys.detail(projectId, provider, id, context), queryFn: () => api.ticket(projectId, id, context), staleTime: 15_000 });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [commentId, setCommentId] = useState<string | undefined>();
  const formId = useId();
  const refresh = async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ticketKeys.list(projectId, provider) }), client.invalidateQueries({ queryKey: ticketKeys.detail(projectId, provider, id) })]);
  };
  const update = useMutation({ mutationFn: (patch: TicketPatch) => api.updateTicket(projectId, id, patch, context), onSuccess: async () => { setEditing(false); await refresh(); toast.success("Ticket saved"); } });
  const saveComment = useMutation({ mutationFn: () => api.saveTicketComment(projectId, id, comment, context, commentId), onSuccess: async () => { setComment(""); setCommentId(undefined); await refresh(); toast.success("Comment saved"); } });
  const ticket = detail.data;
  if (!ticket) return <div className="mc-ticket-reader"><div className="mc-ticket-empty" role={detail.error ? "alert" : "status"}>{detail.error ? errorText(detail.error) : "Loading ticket…"}{detail.error && <Btn size="sm" variant="ghost" onClick={() => void detail.refetch()}>Retry</Btn>}</div></div>;
  function startEdit() { setTitle(ticket!.title); setDescription(ticket!.description); setEditing(true); }
  async function copy() { try { await navigator.clipboard.writeText(ticket!.url); toast.success("Ticket link copied"); } catch { onCopyFailure(ticket!.url); } }
  function add() { try { onPaste(ticketImplementationPrompt(ticket!.url)); toast.success("Added to terminal · Not submitted"); } catch (error) { toast.error(errorText(error)); } }
  return <>
    <div className="mc-ticket-reader"><div className="mc-ticket-reader-content">
      <div className="mc-ticket-source"><code>{ticket.key}</code><Btn variant="ghost" size="sm" icon="external-link" onClick={() => openExternal(ticket.url)}>Open ticket</Btn></div>
      {editing ? <form id={`${formId}-edit`} className="mc-ticket-editor" onSubmit={event => { event.preventDefault(); const patch: TicketPatch = {}; if (title.trim() !== ticket.title) patch.title = title.trim(); if (description !== ticket.description) patch.description = description; if (Object.keys(patch).length) update.mutate(patch); else setEditing(false); }}>
        <label>Title<input name="title" required maxLength={255} value={title} onChange={event => setTitle(event.target.value)} autoFocus /></label>
        <label>Description<textarea name="description" rows={7} maxLength={200000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        {provider === "jira" && <p className="mc-ticket-hint">Editing the description saves plain paragraphs. Existing formatting stays intact when you change only the title.</p>}
        <div className="mc-ticket-actions"><Btn type="button" variant="ghost" size="sm" disabled={update.isPending} onClick={() => setEditing(false)}>Cancel</Btn><Btn type="submit" variant="primary" size="sm" disabled={update.isPending || !title.trim()}>Save ticket</Btn></div>
      </form> : <div className="mc-ticket-title"><h3>{ticket.title}</h3><Btn variant="ghost" size="sm" disabled={!ticket.canEdit} onClick={startEdit}>Edit</Btn></div>}
      <label className="mc-ticket-transition">Status <select aria-label="Ticket status" disabled={!ticket.transitions.length || update.isPending} value="" onChange={event => { if (event.target.value) update.mutate({ transitionId: event.target.value }); }}><option value="">{ticket.status}</option>{ticket.transitions.map(transition => <option key={transition.id} value={transition.id}>{transition.name}</option>)}</select></label>
      {ticket.done && <p className="mc-ticket-notice">Completed · This ticket is outside the pending list.</p>}
      {update.error && <p className="mc-ticket-error" role="alert">{errorText(update.error)}</p>}
      <dl className="mc-ticket-metadata"><div><dt>Assignee</dt><dd>{ticket.assignee ?? "Unassigned"}</dd></div><div><dt>Type</dt><dd>{ticket.type}</dd></div>{ticket.priority && <div><dt>Priority</dt><dd>{ticket.priority}</dd></div>}</dl>
      {!editing && <section><h4>Description</h4><p className="mc-ticket-description">{ticket.description || "No description provided."}</p></section>}
      {reason && <section className="mc-ticket-match"><h4><Icon name="external-link" size={13} /> Why this ticket is here</h4><p>{reason.location} matches “{reason.keyword}”{reason.ancestor ? ` on ${reason.ancestor}. This ticket inherits the match.` : "."}</p></section>}
      <section className="mc-ticket-comments"><h4>Comments <span>{ticket.comments.length}</span></h4>{ticket.commentsLimited && <p className="mc-ticket-hint">Showing the provider’s first 100 comments. Open the ticket to read the full discussion.</p>}
        {ticket.comments.map(item => <article key={item.id}><div><strong>{item.author}</strong>{item.editable && <Btn size="sm" variant="ghost" onClick={() => { setCommentId(item.id); setComment(item.body); }}>Edit comment</Btn>}{item.editExternally && <Btn size="sm" variant="ghost" icon="external-link" onClick={() => openExternal(ticket.url)}>Edit in Jira</Btn>}</div><p>{item.body}</p>{item.editExternally && <p className="mc-ticket-hint">This comment contains rich content. Edit it in Jira to preserve its formatting and attachments.</p>}</article>)}
        {(ticket.canComment || commentId) && <form onSubmit={event => { event.preventDefault(); if (comment.trim()) saveComment.mutate(); }}><label>{commentId ? "Edit your comment" : "Add a comment"}<textarea name="comment" required maxLength={100000} rows={3} value={comment} onChange={event => setComment(event.target.value)} /></label><p className="mc-ticket-hint">Shared with people who can view this ticket.</p><div className="mc-ticket-actions">{commentId && <Btn type="button" variant="ghost" size="sm" onClick={() => { setCommentId(undefined); setComment(""); }}>Cancel</Btn>}<Btn type="submit" variant="ghost" size="sm" disabled={saveComment.isPending || !comment.trim()}>{commentId ? "Save comment" : "Add comment"}</Btn></div>{saveComment.error && <p className="mc-ticket-error" role="alert">{errorText(saveComment.error)}</p>}</form>}
      </section>
    </div></div><footer className="mc-ticket-footer"><Btn size="sm" variant="primary" icon="terminal" onClick={add}>Add to terminal</Btn><Btn size="sm" variant="ghost" icon="copy" onClick={() => void copy()}>Copy link</Btn></footer>
  </>;
}
