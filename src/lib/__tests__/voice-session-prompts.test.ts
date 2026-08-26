import { describe, expect, it } from "vitest";
import {
  setPendingInitialInput,
  takePendingInitialInput,
} from "~/lib/voice-session-prompts";

describe("pending initial input", () => {
  it("submits by default", () => {
    setPendingInitialInput("task-submit", "  ship it  ");

    expect(takePendingInitialInput("task-submit")).toEqual({ text: "ship it", submit: true });
  });

  it("keeps an explicit no-submit prompt unsent", () => {
    setPendingInitialInput("task-handoff", "resolve this conflict", { submit: false });

    expect(takePendingInitialInput("task-handoff")).toEqual({
      text: "resolve this conflict",
      submit: false,
    });
  });

  it("is consumed once so a re-spawn never re-injects it", () => {
    setPendingInitialInput("task-once", "hello");

    expect(takePendingInitialInput("task-once")?.text).toBe("hello");
    expect(takePendingInitialInput("task-once")).toBeUndefined();
  });

  it("ignores blank prompts", () => {
    setPendingInitialInput("task-blank", "   ");

    expect(takePendingInitialInput("task-blank")).toBeUndefined();
  });

  it("evicts the oldest entry past the bound", () => {
    for (let i = 0; i < 17; i += 1) {
      setPendingInitialInput(`bounded-${i}`, `prompt ${i}`);
    }

    expect(takePendingInitialInput("bounded-0")).toBeUndefined();
    expect(takePendingInitialInput("bounded-16")?.text).toBe("prompt 16");
  });
});
