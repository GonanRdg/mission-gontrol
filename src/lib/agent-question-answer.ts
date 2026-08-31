/**
 * Key-sequence builder for answering Claude Code's AskUserQuestion TUI menu.
 *
 * This is the SINGLE place encoding the TUI's key model — if a Claude Code
 * release changes menu semantics, adjust here only. Digits are deliberately
 * not used: whether a digit jumps the highlight or selects immediately has
 * varied across Claude Code versions, while arrows/Space/Enter are stable.
 *
 * Claude Code draws a question in one of two layouts, and they take different
 * keys for a typed answer:
 *
 * - "list" — the default. Rows are the real options, then a synthetic input
 *   row ("Other", placeholder "Type something."), and a "Chat about this"
 *   footer that ↓ from the last row moves to. Highlight the input row, type
 *   inline, Enter submits the typed text.
 * - "preview" — a split pane, drawn for a single-select question when any of
 *   its options carries a `preview`. Rows are the real options ONLY: there is
 *   no input row, and ↓ from the last option jumps to the "Chat about this"
 *   footer, where every key but ↑/Enter/Esc is ignored and Enter cancels the
 *   tool. A typed answer goes into a separate Notes field opened with "n";
 *   Enter there submits it as a notes-only answer (no option selected).
 *
 * Verified against Claude Code 2.1.201 and 2.1.251 by driving real sessions
 * in a PTY and reading the 2.1.251 menu components:
 * - Single-select: highlight starts on option 1; ↓ moves it, Enter selects
 *   and auto-advances to the next question's tab. Same in both layouts.
 * - Multi-select: Space toggles the highlighted row — and so does Enter, so
 *   Enter must NOT be used from an option row. → advances to the next tab.
 *   Multi-select is always the list layout.
 * - After the LAST question of a multi-question payload (and after → on any
 *   final multi-select), a review screen appears ("Ready to submit your
 *   answers? ❯ 1. Submit answers / 2. Cancel") that needs one more Enter.
 *   Single-question single-select payloads submit directly with no review.
 * - "Chat about this" cancels the tool ("User declined to answer questions")
 *   and the agent continues conversationally; no PostToolUse fires, the
 *   question clears via the subsequent Stop hook. It sits one ↓ past the last
 *   row in both layouts.
 */

import { normalizeForMatch } from "./terminal-question-hold";

const KEY_DOWN = "\x1b[B";
const KEY_RIGHT = "\x1b[C";
const KEY_ENTER = "\r";
const KEY_SPACE = " ";
/** Opens the preview layout's Notes field (its only route to a typed answer). */
const KEY_NOTES = "n";

/** Which of the two AskUserQuestion menu layouts a question is drawn in. */
export type MenuLayout = "list" | "preview";

/**
 * Outcome of an overlay submission. "unverified" means the keys were never
 * written because the painted menu didn't match the layout the payload
 * implies — the question is still open in the terminal, untouched.
 */
export type AnswerSubmitResult = "sent" | "failed" | "unverified";

/** The split pane is drawn for single-select questions carrying previews. */
export function menuLayoutForQuestion(question: {
  multiSelect: boolean;
  hasPreviews: boolean;
}): MenuLayout {
  return question.hasPreviews && !question.multiSelect ? "preview" : "list";
}

/** Rows unique to one layout, matched against held menu output. */
const LIST_LAYOUT_MARKER = normalizeForMatch("Type something");
const PREVIEW_LAYOUT_MARKER = normalizeForMatch("press n to add notes");

/**
 * Which layout the terminal actually painted, from the menu output the hold
 * buffered (see terminal-question-hold's getHeldText).
 *
 * "unknown" means the frames match neither layout, or both — the caller must
 * then refuse to inject a typed answer rather than guess, because the wrong
 * walk lands on "Chat about this" and cancels the tool.
 */
export function classifyMenuLayout(heldText: string): MenuLayout | "unknown" {
  const normalized = normalizeForMatch(heldText);
  const list = normalized.includes(LIST_LAYOUT_MARKER);
  const preview = normalized.includes(PREVIEW_LAYOUT_MARKER);
  if (list === preview) return "unknown";
  return list ? "list" : "preview";
}

export type QuestionAnswer =
  | {
      kind: "options";
      /** 0-based indexes into the question's options. Single-select uses [index]. */
      optionIndexes: number[];
      multiSelect: boolean;
    }
  | { kind: "freeText"; text: string }
  | { kind: "chat" };

export type AnswerKeySequence = {
  keys: string[];
  /** Press Enter once more (after a settle pause) to confirm the review screen. */
  needsSubmitConfirm: boolean;
};

const FREE_TEXT_MAX_LENGTH = 4000;

/** Inline TUI text input is single-line; control bytes would drive keybinds. */
export function sanitizeFreeText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, FREE_TEXT_MAX_LENGTH);
}

export function buildAnswerKeySequence(
  answer: QuestionAnswer & {
    optionCount: number;
    /** 0-based position of this question within the payload. */
    questionIndex: number;
    /** Total questions in the payload. */
    questionCount: number;
    menuLayout: MenuLayout;
  },
): AnswerKeySequence {
  const isLast = answer.questionIndex >= answer.questionCount - 1;
  // The lone question of a single-question payload submits directly; every
  // other single-select-style Enter lands on the review screen when last.
  const confirmAfterEnter = isLast && answer.questionCount > 1;

  if (answer.kind === "freeText") {
    const text = sanitizeFreeText(answer.text);
    if (!text) return { keys: [], needsSubmitConfirm: false };
    if (answer.menuLayout === "preview") {
      // No input row exists: "n" opens the Notes field from any option row,
      // and Enter submits it as a notes-only answer, advancing like a pick.
      return {
        keys: [KEY_NOTES, text, KEY_ENTER],
        needsSubmitConfirm: confirmAfterEnter,
      };
    }
    // Highlight the synthetic "Type something." row (first after the real
    // options), type inline, submit like a single-select pick.
    return {
      keys: [...Array<string>(answer.optionCount).fill(KEY_DOWN), text, KEY_ENTER],
      needsSubmitConfirm: confirmAfterEnter,
    };
  }

  if (answer.kind === "chat") {
    // "Chat about this" sits one row past the last, in both layouts (the
    // preview layout ignores the extra ↓); selecting it cancels the whole
    // tool immediately — no review screen ever follows.
    return {
      keys: [...Array<string>(answer.optionCount + 1).fill(KEY_DOWN), KEY_ENTER],
      needsSubmitConfirm: false,
    };
  }

  const max = Math.max(0, answer.optionCount - 1);
  const indexes = [...new Set(answer.optionIndexes)]
    .filter((i) => Number.isInteger(i) && i >= 0)
    .map((i) => Math.min(i, max))
    .sort((a, b) => a - b);
  if (indexes.length === 0) return { keys: [], needsSubmitConfirm: false };

  if (!answer.multiSelect) {
    const target = indexes[0]!;
    return {
      keys: [...Array<string>(target).fill(KEY_DOWN), KEY_ENTER],
      needsSubmitConfirm: confirmAfterEnter,
    };
  }

  // Walk downward from option 0 toggling each selected row, then advance with
  // → (to the next question's tab, or to the Submit tab when this is last).
  const keys: string[] = [];
  let cursor = 0;
  for (const index of indexes) {
    for (; cursor < index; cursor++) keys.push(KEY_DOWN);
    keys.push(KEY_SPACE);
  }
  keys.push(KEY_RIGHT);
  return { keys, needsSubmitConfirm: isLast };
}

export type PayloadAnswerPlan = {
  /**
   * One key walk per question, in payload order; write them in order with
   * INTER_QUESTION_DELAY_MS between walks so the TUI advances tabs between.
   */
  steps: string[][];
  /** Press Enter once more (after a settle pause) to confirm the review screen. */
  needsSubmitConfirm: boolean;
};

/**
 * Key plan for answering a whole AskUserQuestion payload in one injection.
 *
 * The overlay collects answers locally — so the user can step back and revise
 * earlier questions — while the TUI stays parked on question 1. The final
 * submit walks every question in sequence; each walk's Enter/→ advances the
 * TUI to the next tab (verified against 2.1.201 with a 400ms+ gap between
 * walks). `answers` may end early with a `chat` answer: "Chat about this"
 * cancels the whole tool from whichever question row it's selected on, so
 * answers recorded before it just position the TUI on the right tab.
 *
 * Returns null when the answers can't produce a valid key walk.
 */
export function buildPayloadAnswerKeySequence(
  answers: QuestionAnswer[],
  questions: { optionCount: number; menuLayout: MenuLayout }[],
): PayloadAnswerPlan | null {
  if (answers.length === 0 || answers.length > questions.length) return null;
  const steps: string[][] = [];
  let needsSubmitConfirm = false;
  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i]!;
    const sequence = buildAnswerKeySequence({
      ...answer,
      optionCount: questions[i]!.optionCount,
      menuLayout: questions[i]!.menuLayout,
      questionIndex: i,
      questionCount: questions.length,
    });
    if (sequence.keys.length === 0) return null;
    steps.push(sequence.keys);
    if (answer.kind === "chat") {
      // Chat cancels the entire tool immediately; nothing may follow it and
      // no review screen ever appears.
      return i === answers.length - 1 ? { steps, needsSubmitConfirm: false } : null;
    }
    needsSubmitConfirm = sequence.needsSubmitConfirm;
  }
  // Without a trailing chat, every question needs an answer.
  if (answers.length !== questions.length) return null;
  return { steps, needsSubmitConfirm };
}

/**
 * PreToolUse fires before the TUI menu paints, and keys injected during the
 * paint window get misrouted (observed selecting the wrong option on 2.1.201).
 * Answers wait until the question is at least this old before writing keys.
 */
export const MENU_READY_MS = 1500;

/**
 * Pause between one question's key walk and the next, letting the TUI advance
 * to the next tab and repaint (batch walks verified good at 400ms+).
 */
export const INTER_QUESTION_DELAY_MS = 500;

/** Let the TUI process each key before the next arrives (150ms verified good). */
export const ANSWER_KEY_DELAY_MS = 120;

/** Let the review screen mount before the confirming Enter. */
export const SUBMIT_CONFIRM_DELAY_MS = 450;

export const SUBMIT_CONFIRM_KEY = KEY_ENTER;

export async function writeAnswerSequence(
  write: (data: string) => void,
  chunks: string[],
  delayMs: number = ANSWER_KEY_DELAY_MS,
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    write(chunks[i]!);
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
