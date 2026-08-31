import { describe, expect, it } from "vitest";
import {
  buildAnswerKeySequence,
  buildPayloadAnswerKeySequence,
  classifyMenuLayout,
  menuLayoutForQuestion,
  sanitizeFreeText,
  writeAnswerSequence,
} from "../agent-question-answer";

const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const ENTER = "\r";
const SPACE = " ";

const oneOf = { questionIndex: 0, questionCount: 1, menuLayout: "list" } as const;

describe("buildAnswerKeySequence", () => {
  it("submits the first option with a bare Enter", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [0],
        multiSelect: false,
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({ keys: [ENTER], needsSubmitConfirm: false });
  });

  it("navigates down to the target option before Enter", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [2],
        multiSelect: false,
        optionCount: 4,
        ...oneOf,
      })
    ).toEqual({ keys: [DOWN, DOWN, ENTER], needsSubmitConfirm: false });
  });

  it("clamps out-of-bounds indexes to the last option", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [9],
        multiSelect: false,
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({ keys: [DOWN, DOWN, ENTER], needsSubmitConfirm: false });
  });

  it("drops negative and non-integer indexes", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [-1, 1.5],
        multiSelect: false,
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({ keys: [], needsSubmitConfirm: false });
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [],
        multiSelect: false,
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({ keys: [], needsSubmitConfirm: false });
  });

  it("walks down toggling each selected option, then advances with right-arrow", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [0, 2],
        multiSelect: true,
        optionCount: 4,
        ...oneOf,
      })
    ).toEqual({ keys: [SPACE, DOWN, DOWN, SPACE, RIGHT], needsSubmitConfirm: true });
  });

  it("sorts and dedupes multi-select indexes", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [2, 0, 2],
        multiSelect: true,
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({ keys: [SPACE, DOWN, DOWN, SPACE, RIGHT], needsSubmitConfirm: true });
  });

  it("needs no confirm for a non-final question", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [1],
        multiSelect: false,
        optionCount: 3,
        questionIndex: 0,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [DOWN, ENTER], needsSubmitConfirm: false });
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [0],
        multiSelect: true,
        optionCount: 3,
        questionIndex: 0,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [SPACE, RIGHT], needsSubmitConfirm: false });
  });

  it("confirms the review screen after the final question of a multi-question payload", () => {
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [2],
        multiSelect: false,
        optionCount: 3,
        questionIndex: 1,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [DOWN, DOWN, ENTER], needsSubmitConfirm: true });
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [1],
        multiSelect: true,
        optionCount: 3,
        questionIndex: 1,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [DOWN, SPACE, RIGHT], needsSubmitConfirm: true });
  });

  it("navigates past the options to the Type-something row and types inline", () => {
    expect(
      buildAnswerKeySequence({
        kind: "freeText",
        text: "my custom reply",
        optionCount: 3,
        ...oneOf,
      })
    ).toEqual({
      keys: [DOWN, DOWN, DOWN, "my custom reply", ENTER],
      needsSubmitConfirm: false,
    });
  });

  it("free text confirms the review screen on the final question of a multi-question payload", () => {
    expect(
      buildAnswerKeySequence({
        kind: "freeText",
        text: "custom",
        optionCount: 2,
        questionIndex: 1,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [DOWN, DOWN, "custom", ENTER], needsSubmitConfirm: true });
  });

  it("types a preview-layout answer into the Notes field instead", () => {
    expect(
      buildAnswerKeySequence({
        kind: "freeText",
        text: "my custom reply",
        optionCount: 3,
        questionIndex: 0,
        questionCount: 1,
        menuLayout: "preview",
      })
    ).toEqual({ keys: ["n", "my custom reply", ENTER], needsSubmitConfirm: false });
  });

  it("preview-layout free text confirms the review screen when last", () => {
    expect(
      buildAnswerKeySequence({
        kind: "freeText",
        text: "custom",
        optionCount: 2,
        questionIndex: 1,
        questionCount: 2,
        menuLayout: "preview",
      })
    ).toEqual({ keys: ["n", "custom", ENTER], needsSubmitConfirm: true });
  });

  it("picks and cancels with the same keys in both layouts", () => {
    const preview = { questionIndex: 0, questionCount: 1, menuLayout: "preview" } as const;
    expect(
      buildAnswerKeySequence({
        kind: "options",
        optionIndexes: [2],
        multiSelect: false,
        optionCount: 4,
        ...preview,
      })
    ).toEqual({ keys: [DOWN, DOWN, ENTER], needsSubmitConfirm: false });
    expect(buildAnswerKeySequence({ kind: "chat", optionCount: 3, ...preview })).toEqual({
      keys: [DOWN, DOWN, DOWN, DOWN, ENTER],
      needsSubmitConfirm: false,
    });
  });

  it("returns empty keys for unusable free text", () => {
    expect(
      buildAnswerKeySequence({ kind: "freeText", text: "  \r\n ", optionCount: 3, ...oneOf })
    ).toEqual({ keys: [], needsSubmitConfirm: false });
  });

  it("selects the Chat-about-this row below Type-something", () => {
    expect(
      buildAnswerKeySequence({ kind: "chat", optionCount: 3, ...oneOf })
    ).toEqual({ keys: [DOWN, DOWN, DOWN, DOWN, ENTER], needsSubmitConfirm: false });
    expect(
      buildAnswerKeySequence({
        kind: "chat",
        optionCount: 2,
        questionIndex: 0,
        questionCount: 2,
        menuLayout: "list",
      })
    ).toEqual({ keys: [DOWN, DOWN, DOWN, ENTER], needsSubmitConfirm: false });
  });
});

describe("buildPayloadAnswerKeySequence", () => {
  it("plans a single-question payload as one step without confirm", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [{ kind: "options", optionIndexes: [1], multiSelect: false }],
        [{ optionCount: 3, menuLayout: "list" }],
      )
    ).toEqual({ steps: [[DOWN, ENTER]], needsSubmitConfirm: false });
  });

  it("plans one walk per question and confirms the trailing review screen", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [
          { kind: "options", optionIndexes: [1], multiSelect: false },
          { kind: "options", optionIndexes: [0, 1], multiSelect: true },
        ],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 2, menuLayout: "list" }],
      )
    ).toEqual({
      steps: [
        [DOWN, ENTER],
        [SPACE, DOWN, SPACE, RIGHT],
      ],
      needsSubmitConfirm: true,
    });
  });

  it("plans free text mid-payload against that question's own row layout", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [
          { kind: "freeText", text: "custom" },
          { kind: "options", optionIndexes: [0], multiSelect: false },
        ],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 3, menuLayout: "list" }],
      )
    ).toEqual({
      steps: [
        [DOWN, DOWN, "custom", ENTER],
        [ENTER],
      ],
      needsSubmitConfirm: true,
    });
  });

  it("plans each question against its own layout", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [
          { kind: "options", optionIndexes: [1], multiSelect: false },
          { kind: "freeText", text: "custom" },
        ],
        [
          { optionCount: 2, menuLayout: "list" },
          { optionCount: 3, menuLayout: "preview" },
        ],
      )
    ).toEqual({
      steps: [
        [DOWN, ENTER],
        ["n", "custom", ENTER],
      ],
      needsSubmitConfirm: true,
    });
  });

  it("lets a chat answer cancel early, walking prior answers to reach its tab", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [{ kind: "options", optionIndexes: [0], multiSelect: false }, { kind: "chat" }],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 3, menuLayout: "list" }],
      )
    ).toEqual({
      steps: [
        [ENTER],
        [DOWN, DOWN, DOWN, DOWN, ENTER],
      ],
      needsSubmitConfirm: false,
    });
  });

  it("rejects incomplete payloads without a trailing chat", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [{ kind: "options", optionIndexes: [0], multiSelect: false }],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 2, menuLayout: "list" }],
      )
    ).toBeNull();
    expect(buildPayloadAnswerKeySequence([], [{ optionCount: 2, menuLayout: "list" }])).toBeNull();
  });

  it("rejects answers beyond the question count and chat mid-payload", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [
          { kind: "options", optionIndexes: [0], multiSelect: false },
          { kind: "options", optionIndexes: [0], multiSelect: false },
        ],
        [{ optionCount: 2, menuLayout: "list" }],
      )
    ).toBeNull();
    expect(
      buildPayloadAnswerKeySequence(
        [{ kind: "chat" }, { kind: "options", optionIndexes: [0], multiSelect: false }],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 2, menuLayout: "list" }],
      )
    ).toBeNull();
  });

  it("rejects a payload containing an unusable answer", () => {
    expect(
      buildPayloadAnswerKeySequence(
        [
          { kind: "options", optionIndexes: [0], multiSelect: false },
          { kind: "freeText", text: "  \r\n " },
        ],
        [{ optionCount: 2, menuLayout: "list" }, { optionCount: 2, menuLayout: "list" }],
      )
    ).toBeNull();
  });
});

describe("sanitizeFreeText", () => {
  it("collapses newlines and strips control bytes", () => {
    expect(sanitizeFreeText("line one\r\nline two")).toBe("line one line two");
    expect(sanitizeFreeText("a\x1b[Bb\x07c")).toBe("a[Bbc");
    expect(sanitizeFreeText("  padded  ")).toBe("padded");
    expect(sanitizeFreeText("\r\n \t")).toBe("");
  });

  it("caps the length", () => {
    expect(sanitizeFreeText("x".repeat(9000))).toHaveLength(4000);
  });
});

describe("writeAnswerSequence", () => {
  it("writes every chunk in order", async () => {
    const written: string[] = [];
    await writeAnswerSequence((data) => written.push(data), [DOWN, DOWN, ENTER], 0);
    expect(written).toEqual([DOWN, DOWN, ENTER]);
  });

  it("handles an empty sequence", async () => {
    const written: string[] = [];
    await writeAnswerSequence((data) => written.push(data), [], 0);
    expect(written).toEqual([]);
  });
});

describe("menuLayoutForQuestion", () => {
  it("uses the split pane only for single-select questions with previews", () => {
    expect(menuLayoutForQuestion({ multiSelect: false, hasPreviews: true })).toBe("preview");
    expect(menuLayoutForQuestion({ multiSelect: false, hasPreviews: false })).toBe("list");
    // Multi-select never gets the split pane, previews or not.
    expect(menuLayoutForQuestion({ multiSelect: true, hasPreviews: true })).toBe("list");
  });
});

describe("classifyMenuLayout", () => {
  // Held output arrives with cursor moves and styling interleaved into the
  // row text, and wrapped at the pane width.
  const listFrame =
    "\x1b[2J\x1b[H  \x1b[1mPick one\x1b[0m\r\n" +
    "  \x1b[36m\u276f\x1b[0m 1. Ship it\r\n  2. Wait\r\n" +
    "  3. \x1b[2mType some\x1b[0mthing.\r\n  4. Chat about this\r\n" +
    "  \x1b[2menter\x1b[0m to select\r\n";
  const previewFrame =
    "\x1b[2J\x1b[H  \x1b[1mPick one\x1b[0m\r\n" +
    "  \x1b[36m\u276f\x1b[0m 1. Ship it   \u2502 preview text \u2502\r\n" +
    "    2. Wait      \u2502 more preview \u2502\r\n" +
    "  Notes: \x1b[2mpress n to add\x1b[0m notes\r\n" +
    "  3. Chat about this\r\n";

  it("reads the layout off the painted menu", () => {
    expect(classifyMenuLayout(listFrame)).toBe("list");
    expect(classifyMenuLayout(previewFrame)).toBe("preview");
  });

  it("refuses to guess when neither or both markers are present", () => {
    expect(classifyMenuLayout("")).toBe("unknown");
    expect(classifyMenuLayout("a transcript with no menu in it")).toBe("unknown");
    // Both layouts painted (a repaint across a tab switch) is not decidable.
    expect(classifyMenuLayout(listFrame + previewFrame)).toBe("unknown");
  });
});
