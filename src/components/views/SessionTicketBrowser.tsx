import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Btn } from "~/components/ui/Btn";
import { api } from "~/lib/api";
import { getElectron } from "~/lib/electron";
import { openExternal } from "~/lib/open-external";
import { isSettingsOverlayOpen } from "~/lib/settings-navigation";
import { openTicketSettings, ticketKeys } from "~/lib/tickets";
import { selectedTicketUrl, ticketSearchUrl } from "~/shared/ticket-browser";
import { ticketImplementationPrompt } from "~/shared/tickets";
import type { PrBrowserBounds, PrBrowserCommand, PrBrowserState } from "~/shared/pr-browser";
import type { useSessionTickets } from "./SessionTickets";

function boundsFor(slot: HTMLElement): PrBrowserBounds | null {
  if (isSettingsOverlayOpen() || document.querySelector('[data-modal-open], [role="dialog"][aria-modal="true"], [role="menu"]')) return null;
  const box = slot.getBoundingClientRect();
  let left = Math.max(0, box.left), top = Math.max(0, box.top), right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
  for (let element: HTMLElement | null = slot; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    const rect = element.getBoundingClientRect();
    if (style.overflowX !== "visible") { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
    if (style.overflowY !== "visible") { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
  }
  if (right - left < 1 || bottom - top < 1) return null;
  const covering = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  if (covering && covering !== slot && !slot.contains(covering)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function useTicketBrowser(slot: RefObject<HTMLDivElement | null>, sessionId: string, url: string, suspended: boolean) {
  const mountId = useId();
  const [native, setNative] = useState<PrBrowserState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const bridge = getElectron()?.prBrowser, element = slot.current;
    if (!bridge || !element || suspended) return;
    let alive = true, ready = false, busy = false, pending = false, frame = 0;
    let previous = "";
    const sync = async () => {
      frame = 0;
      if (!alive) return;
      if (busy) { pending = true; return; }
      const bounds = boundsFor(element), serialized = JSON.stringify(bounds);
      if (ready && previous === serialized || !ready && !bounds) return;
      busy = true;
      try {
        if (!ready && bounds) {
          const result = await bridge.show(sessionId, mountId, url, bounds, "jira");
          ready = true;
          if (alive) { setNative(result); setError(null); }
          else await bridge.layout(sessionId, mountId, null);
        } else await bridge.layout(sessionId, mountId, bounds);
        previous = serialized;
      } catch { if (alive) setError("Jira browser unavailable. Retry or open the search externally."); }
      finally { busy = false; if (pending && alive) { pending = false; schedule(); } }
    };
    const schedule = () => { if (alive && !frame) frame = requestAnimationFrame(() => void sync()); };
    const off = bridge.onState(next => { if (alive && next.sessionId === sessionId) setNative(next); });
    const resize = new ResizeObserver(schedule); resize.observe(element);
    const changes = new MutationObserver(records => { if (records.some(record => !(record.target instanceof Element) || !record.target.closest(".xterm"))) schedule(); });
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"] });
    window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true); window.addEventListener("pointermove", schedule);
    // Native content must follow the shell's animated settings overlay as well as layout changes.
    const timer = window.setInterval(schedule, 100);
    schedule();
    return () => {
      alive = false; cancelAnimationFrame(frame); clearInterval(timer); off(); resize.disconnect(); changes.disconnect();
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); window.removeEventListener("pointermove", schedule);
      if (ready) void bridge.layout(sessionId, mountId, null).catch(() => {});
    };
  }, [slot, sessionId, mountId, url, suspended, retry]);
  async function command(action: PrBrowserCommand) {
    try { const result = await getElectron()?.prBrowser.command(sessionId, action); if (result) { setNative(result); setError(null); } }
    catch { setError("Jira browser unavailable. Retry or open it externally."); }
  }
  return { native, error: error ?? native?.error, command, retry: () => { setError(null); setRetry(value => value + 1); void command("reload"); } };
}

export function SessionTicketBrowser({ projectId, repoName, state, onClose, onPaste, onToggleExpanded }: {
  projectId: string; repoName: string; state: ReturnType<typeof useSessionTickets>; onClose: () => void; onPaste: (text: string) => void; onToggleExpanded?: () => void;
}) {
  const settings = useQuery({ queryKey: ticketKeys.browser(projectId), queryFn: () => api.ticketBrowserSettings(projectId) });
  const pane = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const url = settings.data ? ticketSearchUrl(settings.data) : null;
  function resize(clientX: number) {
    const box = pane.current?.parentElement?.getBoundingClientRect();
    if (box) state.update({ ratio: Math.min(.8, Math.max(.25, (box.right - clientX) / box.width)) });
  }
  return <aside className="mc-ticket-pane mc-ticket-browser" ref={pane} style={{ width: `${state.ratio * 100}%` }} aria-label={`Jira tickets for ${repoName}`}>
    <div className="mc-ticket-divider" role="separator" tabIndex={0} aria-label="Resize ticket pane" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={80} aria-valuenow={Math.round(state.ratio * 100)}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); state.update({ ratio: Math.min(.8, Math.max(.25, state.ratio + (event.key === "ArrowLeft" ? .03 : -.03))) }); } }}
      onPointerDown={event => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); } }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX); }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }} onLostPointerCapture={() => setDragging(false)} />
    <header className="mc-ticket-header"><div><h3>Jira tickets</h3><p>{repoName}</p></div><div className="mc-ticket-actions"><Btn variant="ghost" size="sm" icon="settings" aria-label="Ticket settings" onClick={() => openTicketSettings(projectId)} /><Btn variant="ghost" size="sm" icon="x" aria-label="Hide tickets" onClick={onClose} /></div></header>
    {settings.isPending ? <div className="mc-ticket-empty" role="status">Loading project ticket settings…</div> : settings.error ? <div className="mc-ticket-empty" role="alert">Could not load ticket settings.<Btn variant="ghost" size="sm" onClick={() => void settings.refetch()}>Retry</Btn></div> : !url ? <div className="mc-ticket-empty"><h3>Configure tickets for {repoName}</h3><p>Choose your Jira site and project, then enter a keyword to search in ticket titles, descriptions, or both.</p><Btn variant="primary" size="sm" onClick={() => openTicketSettings(projectId)}>Configure ticket settings</Btn></div> : <TicketBrowserContent key={`${projectId}:${url}`} sessionId={`tickets:${state.sessionId}:${projectId}`} url={url} site={settings.data!.workspaceUrl} suspended={dragging} onPaste={onPaste} onClose={onClose} onToggleExpanded={onToggleExpanded} />}
  </aside>;
}
function TicketBrowserContent({ sessionId, url, site, suspended, onPaste, onClose, onToggleExpanded }: {
  sessionId: string; url: string; site: string; suspended: boolean; onPaste: (text: string) => void; onClose: () => void; onToggleExpanded?: () => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const browser = useTicketBrowser(slot, sessionId, url, suspended || !!copyFallback);
  const ticket = !browser.native?.loading && !browser.error ? selectedTicketUrl(browser.native?.url ?? "", site) : null;
  useEffect(() => getElectron()?.prBrowser.onIntent(intent => {
    if (intent.sessionId !== sessionId) return;
    if (intent.action === "hide") onClose();
    if (intent.action === "focus") slot.current?.focus({ preventScroll: true });
    if (intent.action === "expand") onToggleExpanded?.();
  }), [sessionId, onClose, onToggleExpanded]);
  if (!getElectron()?.prBrowser) return <div className="mc-ticket-empty"><p>Open this project in the desktop app to browse Jira beside the terminal.</p><Btn variant="ghost" size="sm" onClick={() => openExternal(url)}>Open Jira search</Btn></div>;
  return <>
    <div className="mc-ticket-browser-toolbar"><Btn variant="ghost" size="sm" icon="chevron-left" aria-label="Jira browser back" disabled={!browser.native?.canGoBack} onClick={() => void browser.command("back")} /><Btn variant="ghost" size="sm" icon="chevron-right" aria-label="Jira browser forward" disabled={!browser.native?.canGoForward} onClick={() => void browser.command("forward")} /><Btn variant="ghost" size="sm" icon="refresh" aria-label="Reload Jira" onClick={() => void browser.command("reload")} /><Btn variant="ghost" size="sm" onClick={() => void browser.command("home")}>Search results</Btn><Btn variant="ghost" size="sm" icon="external-link" onClick={() => openExternal(ticket ?? url)}>{ticket ? "Open ticket" : "Open search"}</Btn></div>
    {browser.error && <div className="mc-ticket-error" role="alert">{browser.error}<Btn variant="ghost" size="sm" onClick={browser.retry}>Retry</Btn></div>}
    <div ref={slot} className="mc-ticket-browser-slot" tabIndex={0} role="region" aria-label="Jira search and ticket details" onFocus={() => void browser.command("focus")}>{!browser.native && !browser.error && <p className="mc-ticket-empty" role="status">Opening Jira… Sign in with your company account when prompted.</p>}</div>
    <footer className="mc-ticket-footer"><p role="status">{ticket ? ticket.split("/").pop() : "Open a ticket from the results to add it to the terminal."}</p><Btn variant="primary" size="sm" icon="terminal" disabled={!ticket} onClick={() => { if (ticket) { try { onPaste(ticketImplementationPrompt(ticket)); toast.success("Added to terminal · Not submitted"); } catch { toast.error("The terminal is not ready. Reconnect the terminal and retry."); } } }}>Add to terminal</Btn><Btn variant="ghost" size="sm" icon="copy" disabled={!ticket} onClick={async () => { if (ticket) { try { await navigator.clipboard.writeText(ticket); toast.success("Ticket link copied"); } catch { setCopyFallback(ticket); } } }}>Copy link</Btn></footer>
    {copyFallback && <div className="mc-ticket-copy"><label>Copy ticket link<input readOnly value={copyFallback} onFocus={event => event.target.select()} autoFocus /></label><Btn variant="ghost" size="sm" icon="x" aria-label="Close copy fallback" onClick={() => setCopyFallback(null)} /></div>}
  </>;
}
