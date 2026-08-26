// Consume-once registry of starting prompts for seeded sessions, keyed by
// taskId. createSession stashes the prompt here; TerminalPane reads it at the
// first seedable spawn and passes it as the PTY's initialInput, then it's
// gone — so reloads and re-spawns of the same session never re-inject the prompt.
// Keeping it out-of-band means the normal session path is completely unaffected.

export type PendingInitialInput = {
  text: string;
  /** False leaves the prompt typed but unsent (git handoff); voice submits. */
  submit: boolean;
};

const pending = new Map<string, PendingInitialInput>();
// Defense-in-depth bound: a session that's created but never spawns (e.g. a
// failed create) would otherwise strand its entry forever. Evict oldest first.
const MAX_PENDING = 16;

export function setPendingInitialInput(
  taskId: string,
  text: string,
  opts: { submit?: boolean } = {},
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest !== undefined) pending.delete(oldest);
  }
  pending.set(taskId, { text: trimmed, submit: opts.submit !== false });
}

export function takePendingInitialInput(taskId: string): PendingInitialInput | undefined {
  const entry = pending.get(taskId);
  if (entry !== undefined) pending.delete(taskId);
  return entry;
}
