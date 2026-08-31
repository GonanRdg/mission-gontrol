// Translates keyboard shortcuts that xterm.js doesn't natively forward
// (Shift+Enter, Cmd+arrow line-edits, Option+arrow word-movement) into the
// readline/Claude-Code escape sequences the underlying PTY expects.
// Returns the bytes to write, or null to let xterm handle the event normally.
export function mapTerminalKey(e: KeyboardEvent): string | null {
  if (e.type !== "keydown") return null;

  if (isShiftEnter(e)) {
    return "\x1b\r";
  }

  if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    if (e.key === "ArrowLeft") return "\x01";
    if (e.key === "ArrowRight") return "\x05";
    if (e.key === "Backspace") return "\x15";
  }

  if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    if (e.key === "ArrowLeft") return "\x1bb";
    if (e.key === "ArrowRight") return "\x1bf";
  }

  return altComposedAscii(e);
}

/**
 * macOptionIsMeta (see createTerminalOptions) turns every Option chord into
 * ESC+key, which swallows the characters non-US layouts compose with Option:
 * on the Spanish layout `@` is Option+2 and `#` is Option+3, and `[ ] { } \ |`
 * sit behind Option elsewhere in Europe. Write the composed character instead
 * whenever it is ASCII and the physical key is not a letter — Option+letter
 * stays Meta for Claude Code's bindings, and the US layout's Option characters
 * (™, ¶, …) are all non-ASCII so they keep composing ESC as before.
 */
function altComposedAscii(e: KeyboardEvent): string | null {
  if (!e.altKey || e.metaKey || e.ctrlKey) return null;
  if (/^Key[A-Z]$/.test(e.code)) return null;
  if (e.key.length !== 1) return null;
  const codePoint = e.key.codePointAt(0)!;
  if (codePoint < 0x20 || codePoint > 0x7e) return null;
  return e.key;
}

// xterm.js calls the custom handler for keydown, keypress, and keyup. We write
// custom bytes on keydown, then suppress the follow-up keypress so Chromium
// cannot turn Shift+Enter into a plain Enter byte through the textarea path.
export function shouldSuppressTerminalKey(e: KeyboardEvent): boolean {
  return e.type === "keypress" && isShiftEnter(e);
}

export type TerminalClipboardAction = "copy" | "paste";

/**
 * Recognize terminal copy/paste chords. Ctrl+C is only copy when a selection is
 * present; otherwise it stays available for SIGINT. Ctrl+V always means paste in
 * the embedded terminal on Windows/Linux, matching the desktop app convention.
 *
 * Matches on every event type so the caller can act on keydown and swallow
 * follow-up events, keeping xterm from turning the chord into a stray byte.
 */
export function terminalClipboardAction(
  e: KeyboardEvent,
  opts: { hasSelection?: boolean } = {},
): TerminalClipboardAction | null {
  if (e.altKey) return null;

  if (e.metaKey && !e.ctrlKey && !e.shiftKey) {
    if (isKey(e, "c")) return opts.hasSelection || e.type !== "keydown" ? "copy" : null;
    if (isKey(e, "v")) return "paste";
    return null;
  }

  if (e.ctrlKey && e.shiftKey) {
    if (isKey(e, "c")) return "copy";
    if (isKey(e, "v")) return "paste";
    return null;
  }

  if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (isKey(e, "c")) return opts.hasSelection || e.type !== "keydown" ? "copy" : null;
    if (isKey(e, "v")) return "paste";
  }

  if (e.code === "Insert" || e.key === "Insert") {
    if (e.ctrlKey && !e.shiftKey) return "copy";
    if (e.shiftKey && !e.ctrlKey) return "paste";
  }

  return null;
}

function isShiftEnter(e: KeyboardEvent): boolean {
  return e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
}

function isKey(e: KeyboardEvent, key: "c" | "v"): boolean {
  return e.code === `Key${key.toUpperCase()}` || e.key === key || e.key === key.toUpperCase();
}
