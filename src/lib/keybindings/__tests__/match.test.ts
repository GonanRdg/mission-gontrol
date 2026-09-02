import { afterEach, describe, it, expect, vi } from "vitest";
import { matchBinding, eventToBinding, bindingComboKey, bindingsEqual, isValidBinding, matchPinnedSlotBinding, matchAnyPinnedSlot } from "../match";
import { DEFAULT_BINDINGS } from "../defaults";
import { HOTKEY_ACTIONS } from "../types";

function ev(init: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as unknown as KeyboardEvent;
}

function primaryMod(): { metaKey: boolean; ctrlKey: boolean } {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return { metaKey: isMac, ctrlKey: !isMac };
}

afterEach(() => vi.unstubAllGlobals());

describe("matchBinding", () => {
  it("matches every default binding against an event built from it", () => {
    for (const action of HOTKEY_ACTIONS) {
      const b = DEFAULT_BINDINGS[action];
      const e = ev({ ...primaryMod(), shiftKey: b.shift, altKey: b.alt, key: b.key });
      expect(matchBinding(e, b)).toBe(true);
    }
  });

  it("rejects when modifiers differ", () => {
    const b = DEFAULT_BINDINGS["agent.new"];
    expect(matchBinding(ev({ key: b.key }), b)).toBe(false);
  });

  it("treats Shift+~ as a match for `", () => {
    expect(
      matchBinding(ev({ ...primaryMod(), shiftKey: false, key: "~" }), { mod: true, shift: false, alt: false, key: "`" }),
    ).toBe(true);
  });

  it("treats Shift+} as a match for ] with shift", () => {
    expect(
      matchBinding(ev({ ...primaryMod(), shiftKey: true, key: "}" }), { mod: true, shift: true, alt: false, key: "]" }),
    ).toBe(true);
  });

  it("matches pinned slots that share modifiers with the slot-1 binding", () => {
    const base = { mod: true, shift: false, alt: false, key: "1" };
    expect(matchPinnedSlotBinding(ev({ ...primaryMod(), key: "3" }), base, 3)).toBe(true);
    expect(matchAnyPinnedSlot(ev({ ...primaryMod(), key: "2" }), base)).toBe(2);
  });

  it("is case-insensitive for letter keys", () => {
    const b = { mod: true, shift: false, alt: false, key: "n" };
    expect(matchBinding(ev({ ...primaryMod(), key: "N" }), b)).toBe(true);
  });

  it("does not claim Ctrl shortcuts from terminal apps on macOS", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    const binding = { mod: true, shift: false, alt: false, key: "t" };

    expect(matchBinding(ev({ metaKey: true, key: "t" }), binding)).toBe(true);
    expect(matchBinding(ev({ ctrlKey: true, key: "t" }), binding)).toBe(false);
    expect(eventToBinding(ev({ ctrlKey: true, key: "t" }))).toMatchObject({ mod: false, key: "t" });
  });

  it("uses Ctrl as the primary modifier outside macOS", () => {
    vi.stubGlobal("navigator", { platform: "Linux x86_64" });
    const binding = { mod: true, shift: false, alt: false, key: "t" };

    expect(matchBinding(ev({ ctrlKey: true, key: "t" }), binding)).toBe(true);
    expect(matchBinding(ev({ metaKey: true, key: "t" }), binding)).toBe(false);
  });
});

describe("eventToBinding", () => {
  it("ignores lone modifier keys", () => {
    expect(eventToBinding(ev({ key: "Meta", metaKey: true }))).toBeNull();
  });

  it("captures primary-modifier Shift+P", () => {
    const b = eventToBinding(ev({ ...primaryMod(), shiftKey: true, key: "P" }));
    expect(b).toEqual({ mod: true, shift: true, alt: false, key: "p" });
  });
});

describe("isValidBinding", () => {
  it("requires Cmd/Ctrl", () => {
    expect(isValidBinding({ mod: false, shift: false, alt: false, key: "n" }).ok).toBe(false);
  });
  it("accepts a valid mod+key", () => {
    expect(isValidBinding({ mod: true, shift: false, alt: false, key: "n" }).ok).toBe(true);
  });
});

describe("bindingComboKey + bindingsEqual", () => {
  it("treats the same combo as equal regardless of key casing", () => {
    const a = { mod: true, shift: false, alt: false, key: "N" };
    const b = { mod: true, shift: false, alt: false, key: "n" };
    expect(bindingComboKey(a)).toBe(bindingComboKey(b));
    expect(bindingsEqual(a, b)).toBe(true);
  });
});
