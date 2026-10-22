import { describe, expect, it, vi } from "vitest";
import { clampPrBrowserRatio, getPrBrowserLayout, prBrowserSessionId,
  resolvePrBrowserPullRequest, setPrBrowserLayout } from "../pr-browser-store";

const currentPr = { number: 212, url: "https://github.com/fixture/repo/pull/212", title: "Current branch", headRefName: "feature", isDraft: false };
const otherPr = { number: 211, url: "https://github.com/fixture/repo/pull/211", title: "Other worktree", headRefName: "HOPS-3203", isDraft: true };
const result = { repository: "https://github.com/fixture/repo", pullRequests: [otherPr, currentPr] };

describe("session-owned PR browser layout", () => {
  it("isolates layout between sessions, projects, worktrees, and runtimes", () => {
    const first = prBrowserSessionId({ id: "first" }, "task");
    const ids = [
      prBrowserSessionId({ id: "first" }, "other"),
      prBrowserSessionId({ id: "other" }, "task"),
      prBrowserSessionId({ id: "first", activeWorktreeId: "branch" }, "task"),
      prBrowserSessionId({ id: "first", activeRuntimeScopeId: "sandbox" }, "task"),
    ];
    setPrBrowserLayout(first, { open: true, ratio: 0.65, full: true });
    expect(getPrBrowserLayout(first).open).toBe(true);
    for (const id of ids) expect(getPrBrowserLayout(id).open).toBe(false);
  });
  it("retains the split width when the browser is hidden and reopened", () => {
    const id = "hide-reopen";
    setPrBrowserLayout(id, { open: true, ratio: 0.6 });
    setPrBrowserLayout(id, { open: false });
    setPrBrowserLayout(id, { open: true });
    expect(getPrBrowserLayout(id).ratio).toBe(0.6);
  });
  it("reserves usable widths for both terminal and browser", () => {
    expect(clampPrBrowserRatio(0.01, 1_000)).toBe(0.4);
    expect(clampPrBrowserRatio(0.99, 1_000)).toBe(0.72);
  });
});

describe("session PR selection", () => {
  it("prefers the current branch without selecting an unrelated PR on master", () => {
    expect(resolvePrBrowserPullRequest(result, null, "feature")).toEqual(currentPr);
    expect(resolvePrBrowserPullRequest(result, null, "master")).toBeNull();
    expect(resolvePrBrowserPullRequest(result, null, null)).toBeNull();
  });

  it("retains an explicit PR from another branch across branch changes and refreshes", () => {
    for (const branch of ["master", "feature", null]) {
      expect(resolvePrBrowserPullRequest(result, otherPr, branch)).toEqual(otherPr);
    }
    expect(resolvePrBrowserPullRequest(undefined, otherPr, "feature")).toEqual(otherPr);
    expect(resolvePrBrowserPullRequest({ ...result, pullRequests: [] }, otherPr, "feature")).toEqual(otherPr);
    const refreshed = { ...otherPr, title: "Updated title" };
    expect(resolvePrBrowserPullRequest({ ...result, pullRequests: [refreshed] }, otherPr, "master")).toEqual(refreshed);
  });

  it("ignores a saved selection when the repository origin changes", () => {
    expect(resolvePrBrowserPullRequest({ repository: "https://github.com/other/repo", pullRequests: [] }, otherPr, "master")).toBeNull();
    expect(resolvePrBrowserPullRequest({ repository: null, pullRequests: [] }, otherPr, "master")).toBeNull();
  });

  it("retains a saved selection when only repository casing changes", () => {
    expect(resolvePrBrowserPullRequest({ ...result, repository: "https://github.com/Fixture/REPO" }, otherPr, "feature")).toEqual(otherPr);
  });

  it("isolates an explicit selection between sessions of the same repository", () => {
    const first = prBrowserSessionId({ id: "picker" }, "first");
    const second = prBrowserSessionId({ id: "picker" }, "second");
    setPrBrowserLayout(first, { selectedPullRequest: otherPr, open: true });
    setPrBrowserLayout(second, { selectedPullRequest: currentPr, open: true });
    setPrBrowserLayout(first, { open: false });
    expect(getPrBrowserLayout(first).selectedPullRequest).toEqual(otherPr);
    expect(getPrBrowserLayout(second).selectedPullRequest).toEqual(currentPr);
  });

  it("persists the selected PR across reload and removes it with its owning session", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } });
    try {
      const id = prBrowserSessionId({ id: "persisted-picker" }, "task");
      setPrBrowserLayout(id, { selectedPullRequest: otherPr, open: true, ratio: 0.6 });
      vi.resetModules();
      const reloaded = await import("../pr-browser-store");
      expect(reloaded.getPrBrowserLayout(id)).toMatchObject({ selectedPullRequest: otherPr, open: true, ratio: 0.6 });
      reloaded.forgetPrBrowserSession({ id: "persisted-picker" }, "task");
      expect(storage.has(`mc.prBrowser:${id}`)).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects unsafe saved PR URLs while restoring older layout data", () => {
    vi.stubGlobal("window", { localStorage: {
      getItem: () => JSON.stringify({ open: true, ratio: 0.6, selectedPullRequest: { ...otherPr, url: "javascript:alert(1)" } }),
    } });
    try {
      expect(getPrBrowserLayout("unsafe-picker")).toMatchObject({ open: true, ratio: 0.6, selectedPullRequest: null });
    } finally { vi.unstubAllGlobals(); }
  });
});
