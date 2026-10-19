import { describe, expect, it } from "vitest";
import { clampPrBrowserRatio, getPrBrowserLayout, prBrowserSessionId, setPrBrowserLayout } from "../pr-browser-store";

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
