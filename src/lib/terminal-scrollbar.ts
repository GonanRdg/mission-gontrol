import type { Terminal } from "@xterm/xterm";

export function attachTerminalScrollbar(
  term: Pick<Terminal, "element" | "buffer" | "onScroll" | "onResize" | "onWriteParsed">,
): () => void {
  const element = term.element;
  if (!element) return () => undefined;

  const sync = () => {
    element.toggleAttribute("data-terminal-scrollback", term.buffer.active.baseY > 0);
  };
  const subscriptions = [
    term.onScroll(sync),
    term.onResize(sync),
    term.onWriteParsed(sync),
    term.buffer.onBufferChange(sync),
  ];
  sync();
  return () => {
    for (const subscription of subscriptions) subscription.dispose();
    element.removeAttribute("data-terminal-scrollback");
  };
}
