import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Modal } from "~/components/ui/Modal";
import { Btn } from "~/components/ui/Btn";
import { useKeybindings } from "~/lib/keybindings/store";
import { formatBinding } from "~/lib/keybindings/format";
import { bindingsEqual, matchBinding } from "~/lib/keybindings/match";
import { HOTKEY_ACTIONS } from "~/lib/keybindings/types";
import { useScopedProjects } from "~/queries";
import { useTerminals } from "~/lib/terminal-store";
import { useSessionSwitcher } from "~/lib/session-switcher-store";
import { requestSessionOpenById } from "~/lib/session-notification-store";
import { useActiveGroup, ACTIVE_GROUP_ALL } from "~/lib/active-group";
import { useAddProject } from "~/lib/add-project-store";
import { usePromptSearchPalette } from "~/lib/prompt-search-store";
import { useScratchPad } from "~/lib/scratch-pad-store";
import { OPEN_SETTINGS_EVENT, STATUS_META } from "~/lib/design-meta";
import { isSettingsOverlayOpen } from "~/lib/settings-navigation";
import { projectIdFromPath } from "~/lib/project-id-from-path";
import { exitFocusSession, isFocusPath } from "~/lib/focus-session";
import { scopeKeyForProject } from "~/lib/scoped-project";
import { LOCAL_SCOPE_ID } from "~/shared/sandbox";
import { readJson, writeJson } from "~/lib/local-storage-json";
import { doubleShiftEnabled } from "~/lib/command-palette-preferences";
import {
  createDoubleShiftDetector, OPEN_COMMAND_PALETTE,
  rankPaletteItems, setCommandPaletteOpen, useRegisteredPaletteCommands,
  waitForPaletteCommand, type PaletteCommand,
} from "~/lib/command-palette";
import type { ActiveSessionSummary } from "~/shared/active-sessions";

type Item = PaletteCommand & { category: "Commands" | "Projects" | "Sessions" };
type Target = { scopeKey?: string; session?: ActiveSessionSummary; detail?: string };
const RECENT_KEY = "mc:commandPaletteRecent";

export function CommandPaletteButton() {
  const { bindings } = useKeybindings();
  return <Btn variant="ghost" size="sm" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}
    aria-label="Open command palette" title={`Command palette (${formatBinding(bindings["command.palette"])})`}>⌕</Btn>;
}

export function CommandPalette() {
  const router = useRouter();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const projectId = projectIdFromPath(path);
  const projectsQuery = useScopedProjects();
  const { bindings } = useKeybindings();
  const terminals = useTerminals();
  const switcher = useSessionSwitcher();
  const { activeGroup, groups, setActiveGroup } = useActiveGroup();
  const addProject = useAddProject();
  const prompts = usePromptSearchPalette();
  const scratch = useScratchPad();
  const registered = useRegisteredPaletteCommands();
  const [target, setTarget] = useState<Target | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [highlight, setHighlight] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const executing = useRef(false);
  const listId = useId();
  const latest = useRef({ bindings, terminals, registered, target, projectId });
  latest.current = { bindings, terminals, registered, target, projectId };

  const close = () => {
    setCommandPaletteOpen(false);
    setTarget(null);
  };

  useEffect(() => {
    const detector = createDoubleShiftDetector();
    const open = () => {
      if (executing.current || latest.current.target || isSettingsOverlayOpen() || document.querySelector('[data-modal-open], [role="dialog"][aria-modal="true"]')) return;
      const state = latest.current;
      const focused = state.terminals.gridView
        ? state.terminals.sessions.find((session) => session.taskId === state.terminals.getGridFocusedTaskId())
        : null;
      const scopeKey = focused ? scopeKeyForProject(focused.project)
        : state.registered.find((command) => command.scopeKey)?.scopeKey;
      const session: ActiveSessionSummary | undefined = focused ? {
        taskId: focused.taskId, projectId: focused.project.id, projectName: focused.project.name,
        worktreeId: focused.project.activeWorktreeId ?? null,
        scopeId: focused.project.activeRuntimeScopeId ?? LOCAL_SCOPE_ID,
        title: focused.task.title, icon: null, agent: focused.task.agent,
        status: focused.task.status, updatedAt: Date.now(),
      } : undefined;
      const stored = readJson<unknown>(RECENT_KEY, []);
      setRecent(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string").slice(0, 20) : []);
      setQuery(""); setCategory("All"); setHighlight(0);
      setCommandPaletteOpen(true);
      setTarget({ scopeKey, session, detail: focused
        ? `${focused.project.name} · ${focused.project.activeWorktreeId ?? "main worktree"}` : undefined });
    };
    const keydown = (event: KeyboardEvent) => {
      detector.keydown(event, performance.now());
      if (event.isComposing || event.repeat) return;
      const state = latest.current;
      if (state.target) {
        if (event.key === "Escape" || matchBinding(event, state.bindings["command.palette"])) {
          event.preventDefault(); event.stopImmediatePropagation(); close();
        }
        return;
      }
      if (!matchBinding(event, state.bindings["command.palette"])) return;
      if (isSettingsOverlayOpen() || document.querySelector('[data-modal-open], [role="dialog"][aria-modal="true"]')) return;
      // Explicit existing overrides win over the new default palette binding.
      if (HOTKEY_ACTIONS.some((action) => action !== "command.palette" && bindingsEqual(state.bindings[action], state.bindings["command.palette"]))) return;
      event.preventDefault(); event.stopImmediatePropagation(); open();
    };
    const keyup = (event: KeyboardEvent) => {
      if (detector.keyup(event, performance.now()) && doubleShiftEnabled()) open();
    };
    window.addEventListener(OPEN_COMMAND_PALETTE, open);
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", detector.reset);
    window.addEventListener("pointerdown", detector.reset, true);
    return () => {
      setCommandPaletteOpen(false);
      window.removeEventListener(OPEN_COMMAND_PALETTE, open);
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", detector.reset);
      window.removeEventListener("pointerdown", detector.reset, true);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [target]);
  useEffect(() => { close(); }, [path]);

  const openSession = async (session: ActiveSessionSummary) => {
    if (isFocusPath(path)) await exitFocusSession(router, session.taskId);
    requestSessionOpenById(session);
    await router.navigate({ to: "/projects/$id", params: { id: session.projectId } });
  };
  const settings = async (panel?: string) => {
    if (isFocusPath(path)) await exitFocusSession(router);
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel } }));
  };
  const common: PaletteCommand[] = [
    { id: "settings", label: "Settings", keywords: "preferences configuration", run: () => settings() },
    { id: "keybindings", label: "Keyboard shortcuts", keywords: "settings bindings double shift", run: () => settings("keybindings") },
    { id: "project.add", label: "Add project", shortcut: "project.add", run: addProject.open },
    { id: "prompt.search", label: "Search prompt history", shortcut: "prompt.search", run: prompts.open },
    { id: "scratch.toggle", label: "Open scratch pad", shortcut: "scratch.toggle",
      disabledReason: !projectId ? "Open a project first"
        : target?.session && target.session.projectId !== projectId ? "Switch to the session's project first" : undefined,
      run: scratch.openLatest },
    ...groups.map((group) => ({ id: `group:${group.id}`, label: `Switch group: ${group.name}`, run: () => setActiveGroup(group.id) })),
    { id: "group:all", label: "Show all project groups", run: () => setActiveGroup(ACTIVE_GROUP_ALL) },
  ];
  const commands: Item[] = [...common, ...registered].map((command) => {
    const differentScope = !!command.scopeKey && command.scopeKey !== target?.scopeKey;
    return {
      ...command, category: "Commands",
      detail: differentScope ? target?.detail : command.detail,
      disabledReason: differentScope && !target?.session ? "Workspace changed; reopen the palette" : differentScope ? undefined : command.disabledReason,
      run: async () => {
        if (!command.scopeKey) return command.run();
        if (differentScope && target?.session) await openSession(target.session);
        const live = await waitForPaletteCommand(command.id, target?.scopeKey ?? command.scopeKey);
        if (live.disabledReason) throw new Error(live.disabledReason);
        return live.run();
      },
    };
  });
  const projects: Item[] = [...(projectsQuery.data ?? [])].sort((a, b) =>
    Number(b.groupId === activeGroup) - Number(a.groupId === activeGroup) || Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name),
  ).map((project) => ({
    id: `project:${project.id}`, label: project.name, detail: project.path, keywords: "project repository", category: "Projects",
    run: async () => {
      if (isFocusPath(path)) await exitFocusSession(router);
      await router.navigate({ to: "/projects/$id", params: { id: project.id } });
    },
  }));
  const sessionMap = new Map<string, ActiveSessionSummary>();
  for (const group of [...(switcher.sessions?.live ?? []), ...(switcher.sessions?.recentlyFinished ?? [])]) {
    for (const session of group.sessions) sessionMap.set(`${session.taskId}:${session.worktreeId}:${session.scopeId}`, session);
  }
  for (const session of terminals.sessions) {
    const summary: ActiveSessionSummary = {
      taskId: session.taskId, projectId: session.project.id, projectName: session.project.name,
      worktreeId: session.project.activeWorktreeId ?? null, scopeId: session.project.activeRuntimeScopeId ?? LOCAL_SCOPE_ID,
      title: session.task.title, icon: null, agent: session.task.agent, status: session.task.status, updatedAt: Date.now(),
    };
    const key = `${summary.taskId}:${summary.worktreeId}:${summary.scopeId}`;
    if (!sessionMap.has(key)) sessionMap.set(key, summary);
  }
  const sessions: Item[] = [...sessionMap.entries()].sort(([, a], [, b]) => Number(b.status === "needs-input") - Number(a.status === "needs-input")).map(([key, session]) => ({
    id: `session:${key}`, label: session.title,
    detail: `${session.projectName} · ${session.worktreeId ?? "main"} · ${session.scopeId} · ${session.agent} · ${STATUS_META[session.status].label}`,
    keywords: "session agent terminal", category: "Sessions", run: () => openSession(session),
  }));
  const items = rankPaletteItems([...commands, ...sessions, ...projects].filter((item) => category === "All" || item.category === category), query, recent);
  const selected = Math.min(highlight, Math.max(0, items.length - 1));
  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected, query, category]);
  const execute = async (item: Item) => {
    if (executing.current || item.disabledReason) return;
    executing.current = true;
    writeJson(RECENT_KEY, [item.id, ...recent.filter((id) => id !== item.id)].slice(0, 20));
    flushSync(close);
    try { await item.run(); } catch (error) { toast.error(error instanceof Error ? error.message : "Command failed"); }
    finally { executing.current = false; }
  };

  return <Modal open={target !== null} onClose={close} title="Command palette" width={660} maxHeight="76vh"
    contentStyle={{ padding: 0 }} footer={<span className="mc-command-hint">↑ ↓ navigate · Enter select · Esc close</span>}>
    <div className="mc-command-palette" onKeyDown={(event) => {
      if (event.key !== "Tab") event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight(items.length ? (selected + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length : 0);
      } else if (event.key === "Enter" && event.target === input.current) {
        event.preventDefault();
        if (!event.repeat && items[selected]) void execute(items[selected]);
      }
    }}>
      <input ref={input} className="mc-command-search" role="combobox" aria-label="Search commands, projects, and sessions"
        aria-expanded="true" aria-autocomplete="list" aria-controls={listId}
        aria-activedescendant={items.length ? `${listId}-${selected}` : undefined}
        placeholder="Search commands, projects, sessions…" value={query}
        onChange={(event) => { setQuery(event.target.value); setHighlight(0); }} />
      <div className="mc-command-filters" role="group" aria-label="Search category">
        {["All", "Commands", "Projects", "Sessions"].map((filter) => <button key={filter} type="button" aria-pressed={category === filter}
          onClick={() => { setCategory(filter); setHighlight(0); input.current?.focus(); }}>{filter}</button>)}
      </div>
      <div className="mc-command-results" ref={list} id={listId} role="listbox" aria-label="Results">
        {items.map((item, index) => <div key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === selected}
          aria-disabled={!!item.disabledReason} data-index={index} className="mc-command-row"
          onMouseMove={() => setHighlight(index)} onClick={() => void execute(item)}>
          <span className="mc-command-copy"><span>{item.label}</span><small>{item.disabledReason ?? item.detail ?? ""}</small></span>
          <span className="mc-command-hint">{item.shortcut ? formatBinding(bindings[item.shortcut]) : item.category}</span>
        </div>)}
        {!items.length && <div className="mc-command-empty">No results. Try a project name, session title, or command.</div>}
      </div>
      {(category === "Sessions" || category === "All") && switcher.isError && <button type="button" onClick={switcher.retry}>Could not refresh sessions. Retry</button>}
      {(category === "Projects" || category === "All") && projectsQuery.isError && <button type="button" onClick={() => void projectsQuery.refetch()}>Could not load projects. Retry</button>}
      {(switcher.isLoading || projectsQuery.isLoading) && <div className="mc-command-hint" role="status">Loading destinations…</div>}
    </div>
  </Modal>;
}
