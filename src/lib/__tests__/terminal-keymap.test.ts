import { describe, expect, it } from "vitest";
import {
  mapTerminalKey,
  shouldSuppressTerminalKey,
  terminalClipboardAction,
} from "../terminal-keymap";

function keyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: "keydown",
    key: "",
    code: "",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("terminal keymap", () => {
  it("maps Shift+Enter keydown to ESC+CR", () => {
    expect(mapTerminalKey(keyEvent({ key: "Enter", shiftKey: true }))).toBe("\x1b\r");
  });

  it("suppresses the Shift+Enter keypress without writing duplicate bytes", () => {
    const event = keyEvent({ type: "keypress", key: "Enter", shiftKey: true });

    expect(mapTerminalKey(event)).toBeNull();
    expect(shouldSuppressTerminalKey(event)).toBe(true);
  });

  it("does not suppress normal Enter", () => {
    expect(mapTerminalKey(keyEvent({ key: "Enter" }))).toBeNull();
    expect(shouldSuppressTerminalKey(keyEvent({ type: "keypress", key: "Enter" }))).toBe(false);
  });

  it("writes the ASCII characters non-US layouts compose with Option", () => {
    // Spanish layout: @ is Option+2, # is Option+3.
    expect(mapTerminalKey(keyEvent({ key: "@", code: "Digit2", altKey: true }))).toBe("@");
    expect(mapTerminalKey(keyEvent({ key: "#", code: "Digit3", altKey: true }))).toBe("#");
    // German layout: [ ] { } sit behind Option on the bracket/number keys.
    expect(mapTerminalKey(keyEvent({ key: "[", code: "Digit5", altKey: true }))).toBe("[");
    expect(
      mapTerminalKey(keyEvent({ key: "\\", code: "Digit7", altKey: true, shiftKey: true }))
    ).toBe("\\");
  });

  it("keeps Option+letter as Meta", () => {
    expect(mapTerminalKey(keyEvent({ key: "π", code: "KeyP", altKey: true }))).toBeNull();
    expect(mapTerminalKey(keyEvent({ key: "p", code: "KeyP", altKey: true }))).toBeNull();
  });

  it("keeps the US layout's non-ASCII Option characters as Meta", () => {
    expect(mapTerminalKey(keyEvent({ key: "™", code: "Digit2", altKey: true }))).toBeNull();
    expect(mapTerminalKey(keyEvent({ key: "Dead", code: "KeyE", altKey: true }))).toBeNull();
  });

  it("leaves Option chords with Cmd or Ctrl alone", () => {
    expect(
      mapTerminalKey(keyEvent({ key: "@", code: "Digit2", altKey: true, metaKey: true }))
    ).toBeNull();
    expect(
      mapTerminalKey(keyEvent({ key: "@", code: "Digit2", altKey: true, ctrlKey: true }))
    ).toBeNull();
  });
});

describe("terminal clipboard chords", () => {
  it("maps Ctrl+Shift+C to copy and Ctrl+Shift+V to paste", () => {
    expect(
      terminalClipboardAction(keyEvent({ ctrlKey: true, shiftKey: true, code: "KeyC", key: "C" })),
    ).toBe("copy");
    expect(
      terminalClipboardAction(keyEvent({ ctrlKey: true, shiftKey: true, code: "KeyV", key: "V" })),
    ).toBe("paste");
  });

  it("maps plain Ctrl+C to copy only when a selection exists", () => {
    const event = keyEvent({ ctrlKey: true, code: "KeyC", key: "c" });

    expect(terminalClipboardAction(event, { hasSelection: true })).toBe("copy");
    expect(terminalClipboardAction(event, { hasSelection: false })).toBeNull();
  });

  it("suppresses plain Ctrl+C follow-up events after the keydown path", () => {
    expect(
      terminalClipboardAction(
        keyEvent({ type: "keypress", ctrlKey: true, code: "KeyC", key: "c" }),
        { hasSelection: false },
      ),
    ).toBe("copy");
    expect(
      terminalClipboardAction(
        keyEvent({ type: "keyup", ctrlKey: true, code: "KeyC", key: "c" }),
        { hasSelection: false },
      ),
    ).toBe("copy");
  });

  it("maps plain Ctrl+V to paste", () => {
    expect(terminalClipboardAction(keyEvent({ ctrlKey: true, code: "KeyV", key: "v" }))).toBe(
      "paste",
    );
  });

  it("maps Cmd+C with selection and Cmd+V for macOS", () => {
    expect(terminalClipboardAction(keyEvent({ metaKey: true, code: "KeyC", key: "c" }))).toBeNull();
    expect(
      terminalClipboardAction(keyEvent({ metaKey: true, code: "KeyC", key: "c" }), {
        hasSelection: true,
      }),
    ).toBe("copy");
    expect(terminalClipboardAction(keyEvent({ metaKey: true, code: "KeyV", key: "v" }))).toBe(
      "paste",
    );
  });

  it("maps Ctrl+Insert to copy and Shift+Insert to paste", () => {
    expect(terminalClipboardAction(keyEvent({ ctrlKey: true, key: "Insert", code: "Insert" }))).toBe(
      "copy",
    );
    expect(terminalClipboardAction(keyEvent({ shiftKey: true, key: "Insert", code: "Insert" }))).toBe(
      "paste",
    );
  });

  it("matches the chord on keyup too so xterm never sees a stray byte", () => {
    expect(
      terminalClipboardAction(
        keyEvent({ type: "keyup", ctrlKey: true, shiftKey: true, code: "KeyC", key: "C" }),
      ),
    ).toBe("copy");
  });

  it("does not hijack plain Ctrl+C without selection", () => {
    expect(terminalClipboardAction(keyEvent({ ctrlKey: true, code: "KeyC", key: "c" }))).toBeNull();
  });

  it("ignores Ctrl+Shift with other letters and Alt combos", () => {
    expect(
      terminalClipboardAction(keyEvent({ ctrlKey: true, shiftKey: true, code: "KeyX", key: "X" })),
    ).toBeNull();
    expect(
      terminalClipboardAction(
        keyEvent({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyC", key: "C" }),
      ),
    ).toBeNull();
  });
});
