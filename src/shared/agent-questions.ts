export const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

// Claude Code's AskUserQuestion accepts at most 4 questions of 4 options each;
// anything beyond that in a hook payload is malformed and gets dropped.
const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MAX_TEXT_LENGTH = 2000;

export type AgentQuestionOption = {
  label: string;
  description?: string;
};

export type AgentQuestion = {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: AgentQuestionOption[];
  /**
   * Any option carried a `preview`. Claude Code draws such a single-select
   * question in a split-pane layout with no inline text row, which changes the
   * keys that answer it — see agent-question-answer's menu layouts.
   */
  hasPreviews: boolean;
};

export type PendingQuestion = {
  id: string;
  taskId: string;
  projectId: string;
  questions: AgentQuestion[];
  createdAt: number;
};

function capText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function parseOption(raw: unknown): AgentQuestionOption | null {
  if (!raw || typeof raw !== "object") return null;
  const option = raw as Record<string, unknown>;
  const label = capText(option.label);
  if (!label) return null;
  const description = capText(option.description);
  return description ? { label, description } : { label };
}

function hasPreview(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return (raw as Record<string, unknown>).preview !== undefined;
}

function parseQuestion(raw: unknown): AgentQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const question = capText(q.question);
  if (!question) return null;
  const options = Array.isArray(q.options)
    ? q.options.map(parseOption).filter((o): o is AgentQuestionOption => o !== null)
    : [];
  if (options.length === 0) return null;
  const header = capText(q.header);
  // Read previews off the raw options, not the capped list: the TUI's layout
  // turns on a preview anywhere in the question, including options past ours.
  const hasPreviews = Array.isArray(q.options) && q.options.some(hasPreview);
  return {
    question,
    ...(header ? { header } : {}),
    multiSelect: q.multiSelect === true,
    options: options.slice(0, MAX_OPTIONS),
    hasPreviews,
  };
}

/**
 * Defensive parse of a PreToolUse hook's `tool_input` for AskUserQuestion.
 * The payload is agent-produced but rides an authenticated-yet-open local HTTP
 * endpoint, so treat it as untrusted: trim, cap sizes, drop malformed entries.
 * Returns null when nothing usable remains.
 */
export function parseAskUserQuestionInput(toolInput: unknown): AgentQuestion[] | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const input = toolInput as Record<string, unknown>;
  if (!Array.isArray(input.questions)) return null;
  const questions = input.questions
    .map(parseQuestion)
    .filter((q): q is AgentQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);
  return questions.length > 0 ? questions : null;
}
