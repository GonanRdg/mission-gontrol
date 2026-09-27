import { useEffect, useRef, useSyncExternalStore } from "react";
import type { HotkeyAction } from "./keybindings/types";

export type PaletteCommand = {
  id: string;
  label: string;
  detail?: string;
  keywords?: string;
  shortcut?: HotkeyAction;
  scopeKey?: string;
  disabledReason?: string;
  run: () => void | Promise<unknown>;
};

const owners = new Map<symbol, () => PaletteCommand[]>();
const listeners = new Set<() => void>();
let version = 0;
let open = false;
export const OPEN_COMMAND_PALETTE = "mc:open-command-palette";

export function isCommandPaletteOpen() { return open; }
export function setCommandPaletteOpen(value: boolean) { open = value; }

function notify() {
  version++;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPaletteCommands() {
  return [...owners.values()].flatMap((read) => read());
}

export function usePaletteCommands(commands: PaletteCommand[]) {
  const ref = useRef(commands);
  ref.current = commands;
  const signature = JSON.stringify(commands.map(({ run: _run, ...metadata }) => metadata));
  useEffect(() => {
    const owner = Symbol();
    owners.set(owner, () => ref.current);
    notify();
    return () => { owners.delete(owner); notify(); };
  }, []);
  useEffect(notify, [signature]);
}

export function useRegisteredPaletteCommands() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return getPaletteCommands();
}

export async function waitForPaletteCommand(id: string, scopeKey: string) {
  const find = () => getPaletteCommands().find((command) => command.id === id && command.scopeKey === scopeKey);
  const existing = find();
  if (existing) return existing;
  return new Promise<PaletteCommand>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("The selected workspace is not ready. Open the palette and try again."));
    }, 5000);
    const unsubscribe = subscribe(() => {
      const command = find();
      if (!command) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(command);
    });
  });
}

export function rankPaletteItems<T extends { id: string; label: string; detail?: string; keywords?: string }>(
  items: T[], query: string, recent: string[] = [],
): T[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.map((item, index) => {
    const label = item.label.toLocaleLowerCase();
    const text = `${label} ${item.detail ?? ""} ${item.keywords ?? ""}`.toLocaleLowerCase();
    if (!words.every((word) => text.includes(word))) return null;
    const recentIndex = recent.indexOf(item.id);
    const score = words.length ? (label === query.toLocaleLowerCase().trim() ? 100 : 0) + words.filter((word) => label.startsWith(word)).length * 10
      : recentIndex < 0 ? 0 : 50 - recentIndex;
    return { item, index, score };
  }).filter((entry) => entry !== null).sort((a, b) => b.score - a.score || a.index - b.index).map((entry) => entry.item);
}

export function createDoubleShiftDetector() {
  let downAt: number | null = null;
  let lastTap: number | null = null;
  const reset = () => { downAt = null; lastTap = null; };
  return {
    reset,
    keydown(event: Pick<KeyboardEvent, "key" | "repeat" | "altKey" | "ctrlKey" | "metaKey" | "isComposing">, now: number) {
      if (event.key !== "Shift" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) reset();
      else if (downAt === null) downAt = now;
      else reset();
    },
    keyup(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">, now: number) {
      if (event.key !== "Shift" || event.altKey || event.ctrlKey || event.metaKey || downAt === null || now - downAt > 250) {
        reset();
        return false;
      }
      downAt = null;
      if (lastTap !== null && now - lastTap < 400) { reset(); return true; }
      lastTap = now;
      return false;
    },
  };
}
