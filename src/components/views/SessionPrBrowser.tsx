import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Btn } from "~/components/ui/Btn";
import { Tooltip } from "~/components/ui/Tooltip";
import { getElectron } from "~/lib/electron";
import { openExternal } from "~/lib/open-external";
import { isSettingsOverlayOpen } from "~/lib/settings-navigation";
import {
  clampPrBrowserRatio, getPrBrowserLayout, MIN_PR_SPLIT_WIDTH, prBrowserSessionId,
  setPrBrowserLayout, subscribePrBrowserLayout,
} from "~/lib/pr-browser-store";
import { useBranchPullRequest, useGitStatus } from "~/queries/git";
import { LOCAL_SCOPE_ID } from "~/shared/sandbox";
import type { PrBrowserBounds, PrBrowserCommand, PrBrowserState } from "~/shared/pr-browser";
import "./session-pr-browser.css";

export function useSessionPrBrowser({ project, taskId, paneRef, expanded, onToggleExpanded, focusTerminal, enabled }: {
  project: { id: string; activeWorktreeId?: string | null; activeRuntimeScopeId?: string | null };
  taskId: string;
  paneRef: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  onToggleExpanded?: () => void;
  focusTerminal: () => void;
  enabled: boolean;
}) {
  const sessionId = prBrowserSessionId(project, taskId);
  const layout = useSyncExternalStore(subscribePrBrowserLayout,
    useCallback(() => getPrBrowserLayout(sessionId), [sessionId]),
    useCallback(() => getPrBrowserLayout(sessionId), [sessionId]));
  const local = enabled && (project.activeRuntimeScopeId ?? LOCAL_SCOPE_ID) === LOCAL_SCOPE_ID;
  const git = useGitStatus(project.id, project.activeWorktreeId, { enabled: local });
  const branch = git.data?.branch ?? null;
  const lookup = useBranchPullRequest(project.id, project.activeWorktreeId, branch, local);
  const pr = lookup.data?.branch === branch ? lookup.data.pullRequest : null;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(pane);
    return () => observer.disconnect();
  }, [paneRef]);
  const current = useRef({ expanded, onToggleExpanded, focusTerminal, layout });
  current.current = { expanded, onToggleExpanded, focusTerminal, layout };

  const hide = useCallback(() => {
    const value = current.current;
    if (value.layout.expandedByBrowser && value.expanded) value.onToggleExpanded?.();
    setPrBrowserLayout(sessionId, { open: false, full: false, expandedByBrowser: false, splitNeedsExpanded: false });
    requestAnimationFrame(() => current.current.focusTerminal());
  }, [sessionId]);

  const toggleExpanded = useCallback(() => {
    const value = current.current;
    if (value.layout.full) {
      if (value.layout.expandedByBrowser && !value.layout.splitNeedsExpanded && value.expanded) {
        value.onToggleExpanded?.();
        setPrBrowserLayout(sessionId, { full: false, expandedByBrowser: false });
      } else setPrBrowserLayout(sessionId, { full: false });
    } else {
      const expandSession = !value.expanded && !!value.onToggleExpanded;
      setPrBrowserLayout(sessionId, { full: true, expandedByBrowser: value.layout.expandedByBrowser || expandSession });
      if (expandSession) value.onToggleExpanded?.();
    }
  }, [sessionId]);

  const toggle = useCallback(() => {
    if (current.current.layout.open) { hide(); return; }
    if (!pr) return;
    if (!getElectron()?.prBrowser) { void openExternal(pr.url); return; }
    const narrow = (paneRef.current?.getBoundingClientRect().width ?? 0) < MIN_PR_SPLIT_WIDTH;
    const expandSession = narrow && !current.current.expanded && !!current.current.onToggleExpanded;
    setPrBrowserLayout(sessionId, { open: true, full: narrow, expandedByBrowser: expandSession, splitNeedsExpanded: expandSession });
    if (expandSession) current.current.onToggleExpanded?.();
  }, [hide, paneRef, pr, sessionId]);

  useEffect(() => {
    if (layout.open && lookup.isSuccess && lookup.data.branch === branch && !pr) hide();
  }, [branch, hide, layout.open, lookup.data, lookup.isSuccess, pr]);

  useEffect(() => getElectron()?.prBrowser?.onIntent((intent) => {
    if (intent.sessionId !== sessionId) return;
    if (intent.action === "hide") hide();
    else if (intent.action === "focus") paneRef.current?.querySelector<HTMLElement>(".mc-pr-browser-content")?.focus({ preventScroll: true });
    else if (intent.action === "expand") toggleExpanded();
    else if (current.current.layout.full) toggleExpanded();
  }), [hide, paneRef, sessionId, toggleExpanded]);

  const open = local && layout.open && !!pr && !!getElectron()?.prBrowser;
  const full = layout.full || (width > 0 && width < MIN_PR_SPLIT_WIDTH);
  const ratio = clampPrBrowserRatio(layout.ratio, width);
  const resize = useCallback((next: number) => {
    setPrBrowserLayout(sessionId, { ratio: clampPrBrowserRatio(next, paneRef.current?.getBoundingClientRect().width ?? 0) });
  }, [paneRef, sessionId]);
  return { sessionId, pr, open, full, ratio, toggle, hide, toggleExpanded, resize,
    error: lookup.error, checking: lookup.isFetching, retry: () => void lookup.refetch() };
}

export function PrBrowserButton({ browser, compact = false }: {
  browser: ReturnType<typeof useSessionPrBrowser>; compact?: boolean;
}) {
  if (!browser.pr && !browser.error) return null;
  const label = browser.error ? "Retry PR lookup" : browser.open ? "Hide PR browser" : "Open PR browser";
  return (
    <Tooltip content={browser.error instanceof Error ? `${browser.error.message} Click to retry.` :
      `${label}${browser.pr?.isDraft ? " · Draft" : ""}${browser.pr ? ` · ${browser.pr.title}` : ""}`}>
      <Btn variant="ghost" size="sm" icon="github" aria-label={label} aria-pressed={browser.open}
        aria-busy={browser.checking} disabled={!!browser.error && browser.checking}
        onClick={browser.error ? browser.retry : browser.toggle}
        style={{ flexShrink: 0, color: browser.error ? "var(--status-failed)" : browser.open ? "var(--accent)" : undefined,
          ...(compact ? { width: 34, padding: 0 } : {}) }}>
        {!compact && (browser.pr ? `PR #${browser.pr.number}` : "PR")}
      </Btn>
    </Tooltip>
  );
}

function visibleBounds(slot: HTMLElement): PrBrowserBounds | null {
  if (isSettingsOverlayOpen() || document.querySelector('[data-modal-open], [role="dialog"][aria-modal="true"], [role="menu"]')) return null;
  if (getComputedStyle(slot).visibility === "hidden") return null;
  const rect = slot.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
  for (let ancestor = slot.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return null;
    const box = ancestor.getBoundingClientRect();
    if (style.overflowX !== "visible") { left = Math.max(left, box.left); right = Math.min(right, box.right); }
    if (style.overflowY !== "visible") { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
  }
  if (right - left < 1 || bottom - top < 1) return null;
  const covering = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  if (covering && covering !== slot && !slot.contains(covering)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function SessionPrBrowser({ browser }: { browser: ReturnType<typeof useSessionPrBrowser> }) {
  const { sessionId, pr, full, ratio, hide, toggleExpanded, resize } = browser;
  const mountId = useId();
  const slotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [native, setNative] = useState<PrBrowserState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const draggingRef = useRef(false);
  draggingRef.current = dragging;

  useEffect(() => {
    const bridge = getElectron()?.prBrowser;
    const slot = slotRef.current;
    if (!bridge || !slot || !pr) return;
    let alive = true, ready = false, busy = false, pending = false, frame = 0, animationFrame = 0;
    let previous = "";
    const sync = async () => {
      frame = 0;
      if (!alive) return;
      if (busy) { pending = true; return; }
      const bounds = draggingRef.current ? null : visibleBounds(slot);
      const serialized = JSON.stringify(bounds);
      if (ready && serialized === previous) return;
      if (!ready && !bounds) return;
      busy = true;
      try {
        if (!ready && bounds) {
          const result = await bridge.show(sessionId, mountId, pr.url, bounds);
          ready = true;
          if (alive) { setNative(result); setError(null); }
          else await bridge.layout(sessionId, mountId, null);
        } else await bridge.layout(sessionId, mountId, bounds);
        previous = serialized;
      } catch { if (alive) setError("Browser unavailable. Retry or open the PR externally."); }
      finally {
        busy = false;
        if (pending && alive) { pending = false; schedule(); }
      }
    };
    const schedule = () => { if (alive && !frame) frame = requestAnimationFrame(() => void sync()); };
    const off = bridge.onState((next) => { if (next.sessionId === sessionId && alive) setNative(next); });
    const observer = new ResizeObserver(schedule);
    observer.observe(slot);
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !(record.target instanceof Element) || !record.target.closest(".xterm"))) schedule();
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden", "data-pr-resizing"] });
    const trackAnimation = () => {
      cancelAnimationFrame(animationFrame);
      schedule();
      let moving = false;
      for (let element: HTMLElement | null = slot; element; element = element.parentElement) {
        if (element.getAnimations().some((animation) => animation.playState === "running" &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime))) { moving = true; break; }
      }
      if (alive && moving) animationFrame = requestAnimationFrame(trackAnimation);
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("pointermove", schedule);
    document.addEventListener("transitionrun", trackAnimation, true);
    schedule();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(animationFrame);
      observer.disconnect(); mutations.disconnect(); off();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("pointermove", schedule);
      document.removeEventListener("transitionrun", trackAnimation, true);
      if (ready) void bridge.layout(sessionId, mountId, null).catch(() => {});
    };
  }, [sessionId, mountId, pr?.url, retryNonce]);

  const command = async (action: PrBrowserCommand) => {
    try {
      const result = await getElectron()?.prBrowser?.command(sessionId, action);
      if (result) { setNative(result); setError(null); }
    } catch { setError("Browser unavailable. Open the PR externally or reopen this pane."); }
  };
  const failure = error ?? native?.error;
  if (!pr) return null;
  return (
    <section ref={panelRef} className={`mc-pr-browser${full ? " mc-pr-browser-full" : ""}`}
      data-pr-resizing={dragging || undefined}
      aria-label={`Browser for PR #${pr.number}`} style={{ width: full ? "100%" : `${ratio * 100}%` }}>
      {!full && <div className="mc-pr-browser-divider" role="separator" aria-label="Resize PR browser"
        aria-orientation="vertical" aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(ratio * 100)} tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault(); resize(ratio + (event.key === "ArrowLeft" ? 0.03 : -0.03));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const parent = panelRef.current?.parentElement?.getBoundingClientRect();
          if (parent) resize((parent.right - event.clientX) / parent.width);
        }}
        onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }}
        onLostPointerCapture={() => setDragging(false)} />}
      <div className="mc-pr-browser-toolbar">
        <Tooltip content="Back"><Btn variant="ghost" size="sm" icon="chevron-left" aria-label="Browser back" disabled={!native?.canGoBack} onClick={() => void command("back")} /></Tooltip>
        <Tooltip content="Forward"><Btn variant="ghost" size="sm" icon="chevron-right" aria-label="Browser forward" disabled={!native?.canGoForward} onClick={() => void command("forward")} /></Tooltip>
        <Tooltip content="Reload"><Btn variant="ghost" size="sm" icon="refresh" aria-label="Reload PR browser" onClick={() => void command("reload")} /></Tooltip>
        <span className="mc-pr-browser-location" title={native?.url ?? pr.url} aria-busy={native?.loading || undefined}>
          {native?.url ?? pr.url}
        </span>
        <Tooltip content="Open PR externally"><Btn variant="ghost" size="sm" icon="external-link" aria-label="Open PR externally" onClick={() => void openExternal(pr.url)} /></Tooltip>
        <Tooltip content={full ? "Restore split view" : "Expand PR browser"}><Btn variant="ghost" size="sm" icon={full ? "minimize" : "maximize"}
          aria-label={full ? "Restore PR split view" : "Expand PR browser"} aria-pressed={full} onClick={toggleExpanded} /></Tooltip>
        <Tooltip content="Hide PR browser"><Btn variant="ghost" size="sm" icon="x" aria-label="Close PR browser" onClick={hide} /></Tooltip>
      </div>
      {failure && <div className="mc-pr-browser-error" role="alert">{failure}
        <Btn variant="ghost" size="sm" onClick={() => {
          if (error) { setError(null); setRetryNonce((value) => value + 1); }
          else void command("reload");
        }}>Retry</Btn>
      </div>}
      <div ref={slotRef} className="mc-pr-browser-content" tabIndex={0} role="region"
        aria-label={`PR #${pr.number} web page`} onFocus={() => void command("focus")}>
        {!native && !failure && <span className="mc-pr-browser-loading" role="status">Opening PR…</span>}
      </div>
    </section>
  );
}
