import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFormPreferences } from "~/shared/action-form-preferences";

type HookSlot = {
  current?: unknown;
  value?: unknown;
  deps?: readonly unknown[];
  cleanup?: () => void;
};

const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as HookSlot[] }));

function sameDeps(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  return !!left && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

vi.mock("react", () => ({
  useRef: <T,>(initial: T) => {
    const index = harness.cursor++;
    harness.slots[index] ??= { current: initial };
    return harness.slots[index] as { current: T };
  },
  useCallback: <T,>(callback: T, deps: readonly unknown[]) => {
    const index = harness.cursor++;
    const slot = harness.slots[index];
    if (!slot || !sameDeps(slot.deps, deps)) {
      harness.slots[index] = { value: callback, deps };
      return callback;
    }
    return slot.value as T;
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = harness.cursor++;
    const slot = harness.slots[index];
    if (slot && sameDeps(slot.deps, deps)) return;
    slot?.cleanup?.();
    const cleanup = effect();
    harness.slots[index] = {
      deps,
      cleanup: typeof cleanup === "function" ? cleanup : undefined,
    };
  },
}));

const { useActionFormPreferencesAutosave } =
  await import("../use-action-form-preferences-autosave");

const initial: ActionFormPreferences = {
  repository: "/src/app",
  agent: "codex",
  branch: "main",
  options: { plan: true },
  sourceTypes: ["jira"],
};

function ActionPreferencesHarness(
  preferences: ActionFormPreferences,
  save: (preferences: ActionFormPreferences) => Promise<void>,
): void {
  harness.cursor = 0;
  useActionFormPreferencesAutosave(preferences, save);
}

function unmount(): void {
  for (const slot of [...harness.slots].reverse()) slot.cleanup?.();
  harness.slots = [];
  harness.cursor = 0;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("action form preference autosave", () => {
  it("drops an unsent edit when the form returns to the persisted value", async () => {
    const save = vi.fn(async () => undefined);
    ActionPreferencesHarness(initial, save);
    ActionPreferencesHarness({ ...initial, branch: "feat/draft" }, save);
    ActionPreferencesHarness(initial, save);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(save).not.toHaveBeenCalled();
  });

  it("chains a reverted value after an older save already started", async () => {
    let resolveFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const save = vi
      .fn<(preferences: ActionFormPreferences) => Promise<void>>()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValue(undefined);
    const draft = { ...initial, branch: "feat/draft" };
    ActionPreferencesHarness(initial, save);
    ActionPreferencesHarness(draft, save);
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledWith(draft);

    ActionPreferencesHarness(initial, save);
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);

    expect(save).toHaveBeenLastCalledWith(initial);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("retries a failed save without treating it as persisted", async () => {
    const next = { ...initial, options: { plan: false } };
    const save = vi
      .fn<(preferences: ActionFormPreferences) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    ActionPreferencesHarness(initial, save);
    ActionPreferencesHarness(next, save);

    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(2_000);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(next);
  });
});
