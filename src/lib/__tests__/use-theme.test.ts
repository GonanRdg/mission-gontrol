import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the dark/light preference logic without rendering the React hook
// (the test env is node, no DOM renderer): readCachedTheme() and the way
// applyThemeStyle reconciles `data-theme` — both theme styles honour the
// stored preference, and it survives switching between them.

function mockDom() {
  const store = new Map<string, string>();
  const attrs = new Map<string, string>();
  // Frame-art URLs are written as inline custom properties, so the stub needs
  // a `style` surface for applyFrameArt to write into.
  const props = new Map<string, string>();
  const previousWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  } as unknown as Window & typeof globalThis;

  vi.stubGlobal("document", {
    documentElement: {
      getAttribute: (name: string) => attrs.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attrs.set(name, value),
      removeAttribute: (name: string) => void attrs.delete(name),
      style: {
        setProperty: (name: string, value: string) => void props.set(name, value),
      },
    },
  });

  return {
    store,
    attrs,
    props,
    restore() {
      globalThis.window = previousWindow;
      vi.unstubAllGlobals();
    },
  };
}

describe("use-theme + data-theme reconciliation", () => {
  let dom: ReturnType<typeof mockDom>;

  beforeEach(() => {
    vi.resetModules();
    dom = mockDom();
  });

  afterEach(() => {
    dom.restore();
  });

  it("defaults the cached theme to dark and reads a stored light preference", async () => {
    const { readCachedTheme } = await import("../use-theme");
    expect(readCachedTheme()).toBe("dark");
    dom.store.set("mc.theme", "light");
    expect(readCachedTheme()).toBe("light");
  });

  it("applies the stored light preference when the flat theme is selected", async () => {
    dom.store.set("mc.theme", "light");
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("flat");
    expect(dom.attrs.get("data-minimal")).toBe("true");
    expect(dom.attrs.get("data-theme")).toBe("light");
  });

  it("applies the stored light preference when the painted theme is selected", async () => {
    dom.store.set("mc.theme", "light");
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("painted");
    expect(dom.attrs.has("data-minimal")).toBe(false);
    expect(dom.attrs.get("data-theme")).toBe("light");
  });

  it("keeps the light preference across a style switch in both directions", async () => {
    dom.store.set("mc.theme", "light");
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("painted");
    expect(dom.attrs.get("data-theme")).toBe("light");
    applyThemeStyle("flat");
    expect(dom.attrs.get("data-theme")).toBe("light");
    applyThemeStyle("painted");
    expect(dom.attrs.get("data-theme")).toBe("light");
  });

  it("binds the light cut of the painted frame art in light mode", async () => {
    dom.store.set("mc.theme", "light");
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("painted");
    expect(dom.props.get("--mc-panel-image")).toContain("square_deep-orange-light.png");
    expect(dom.props.get("--mc-shell-image")).toContain("shell_deep-orange-light.png");
    // The solid accent CTA has no light cut — it reads fine on paper as-is.
    expect(dom.props.get("--mc-btn-filled-image")).toContain(
      "button_filled_deep-orange.png",
    );
  });

  it("binds the original frame art in dark mode", async () => {
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("painted");
    expect(dom.props.get("--mc-panel-image")).toContain("square_deep-orange.png");
    expect(dom.props.get("--mc-panel-image")).not.toContain("-light");
  });

  it("leaves the appearance dark for either style with no stored preference", async () => {
    const { applyThemeStyle } = await import("../theme-style");
    applyThemeStyle("painted");
    expect(dom.attrs.get("data-theme")).toBe("dark");
    applyThemeStyle("flat");
    expect(dom.attrs.get("data-theme")).toBe("dark");
  });
});
