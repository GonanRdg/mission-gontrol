import { getElectron } from "./electron";
import { LOCAL_SCOPE_ID } from "~/shared/sandbox";
import { MAIN_WORKTREE_ID } from "~/shared/worktrees";
import { isRepositoryPullRequest, type RepositoryPullRequest, type RepositoryPullRequestsResult } from "~/shared/pr-browser";

export type PrBrowserLayout = {
  open: boolean;
  ratio: number;
  full: boolean;
  expandedByBrowser: boolean;
  splitNeedsExpanded: boolean;
  selectedPullRequest: RepositoryPullRequest | null;
};

const defaults: PrBrowserLayout = {
  open: false, ratio: 0.5, full: false, expandedByBrowser: false, splitNeedsExpanded: false, selectedPullRequest: null,
};
const layouts = new Map<string, PrBrowserLayout>();
const listeners = new Set<() => void>();
const storageKey = (id: string) => `mc.prBrowser:${id}`;

export function prBrowserSessionId(
  project: { id: string; activeWorktreeId?: string | null; activeRuntimeScopeId?: string | null },
  taskId: string,
): string {
  return JSON.stringify([project.id, project.activeWorktreeId ?? MAIN_WORKTREE_ID,
    project.activeRuntimeScopeId ?? LOCAL_SCOPE_ID, taskId]);
}

export function getPrBrowserLayout(id: string): PrBrowserLayout {
  let layout = layouts.get(id);
  if (layout) return layout;
  layout = { ...defaults };
  if (typeof window !== "undefined") {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(id)) ?? "null");
      if (saved && typeof saved.open === "boolean") layout.open = saved.open;
      if (saved && Number.isFinite(saved.ratio)) layout.ratio = Math.max(0.15, Math.min(0.85, saved.ratio));
      if (isRepositoryPullRequest(saved?.selectedPullRequest)) layout.selectedPullRequest = saved.selectedPullRequest;
    } catch { /* Storage may be unavailable. */ }
  }
  layouts.set(id, layout);
  return layout;
}

export function setPrBrowserLayout(id: string, patch: Partial<PrBrowserLayout>) {
  const layout = { ...getPrBrowserLayout(id), ...patch };
  layouts.set(id, layout);
  try { window.localStorage.setItem(storageKey(id), JSON.stringify({
    open: layout.open, ratio: layout.ratio, selectedPullRequest: layout.selectedPullRequest,
  })); }
  catch { /* Storage may be unavailable. */ }
  for (const listener of listeners) listener();
}

export function resolvePrBrowserPullRequest(
  result: RepositoryPullRequestsResult | undefined,
  selected: RepositoryPullRequest | null,
  branch: string | null,
): RepositoryPullRequest | null {
  if (selected && (!result || (result.repository && selected.url.startsWith(`${result.repository}/pull/`)))) {
    return result?.pullRequests.find((pr) => pr.url === selected.url) ?? selected;
  }
  return result?.pullRequests.find((pr) => pr.headRefName === branch) ?? null;
}

export function subscribePrBrowserLayout(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function forgetPrBrowserSession(project: Parameters<typeof prBrowserSessionId>[0], taskId: string) {
  const id = prBrowserSessionId(project, taskId);
  layouts.delete(id);
  try { window.localStorage.removeItem(storageKey(id)); } catch { /* Storage may be unavailable. */ }
  void getElectron()?.prBrowser?.destroy(id).catch(() => {});
  for (const listener of listeners) listener();
}

export const MIN_PR_SPLIT_WIDTH = 680;

export function clampPrBrowserRatio(ratio: number, width: number): number {
  if (width < MIN_PR_SPLIT_WIDTH) return 0.5;
  return Math.max(400 / width, Math.min(1 - 280 / width, ratio));
}
