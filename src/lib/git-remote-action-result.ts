// Pure mapping from a git fetch/pull/push outcome to what the UI shows: toast
// tone/title/detail/duration, whether the outcome is worth keeping in the
// notifications bell, and each button's disabled/tooltip state.
//
// Kept free of JSX and `window` so it is unit-testable under vitest's node
// environment. The server never tags fetch/pull/push failures with a `kind`
// (gitErrorPayload only sets one for commit-CLI / branch-in-worktree errors),
// so nothing here branches on it — failures are message + stderr, shown as-is.

import { ApiError } from "~/lib/api";
import type {
  CommitResult,
  FetchResult,
  PullMode,
  PullResult,
  PushResult,
} from "~/server/services/git";

export type GitRemoteAction = "fetch" | "pull" | "push" | "commit";

export type GitRemoteResultKind =
  | FetchResult["kind"]
  | PullResult["kind"]
  | PushResult["kind"]
  | CommitResult["kind"]
  | "error";

export type GitRemoteOutcome = {
  action: GitRemoteAction;
  /** Only set for pulls — which strategy was asked for. */
  mode?: PullMode;
  resultKind: GitRemoteResultKind;
  tone: "success" | "error";
  title: string;
  detail: string;
  /** `null` means sticky (`Infinity`): failures stay until dismissed. */
  durationMs: number | null;
};

export type GitRemoteCall =
  | { action: "fetch"; result: FetchResult }
  | { action: "pull"; mode: PullMode; result: PullResult }
  | { action: "push"; result: PushResult };

/** Message + raw stderr pulled apart from a `/api/.../git/*` 400 body. */
export type GitApiErrorParts = {
  message: string;
  stderr?: string;
  kind?: string;
  worktreeId?: string;
};

const ACTION_LABEL: Record<GitRemoteAction, string> = {
  fetch: "Fetch",
  pull: "Pull",
  push: "Push",
  commit: "Commit",
};

const BUSY_LABEL: Record<GitRemoteAction, string> = {
  fetch: "Fetching…",
  pull: "Pulling…",
  push: "Pushing…",
  commit: "Committing…",
};

const ARIA_LABEL: Record<GitRemoteAction, string> = {
  fetch: "Fetch from origin",
  pull: "Pull from origin",
  push: "Push to origin",
  commit: "Commit and push",
};

// Success toasts auto-dismiss; the shorter ones are "nothing happened" results
// that don't deserve the same dwell time as a real transfer.
const SUCCESS_MS = 4_000;
const NOOP_MS = 3_000;
const UPSTREAM_SET_MS = 5_000;

/** Cap on stderr lines kept in an error toast — the card grows vertically. */
const MAX_STDERR_LINES = 20;

const FALLBACK_BRANCH = "HEAD";

function branchLabel(branch: string | null | undefined): string {
  return branch?.trim() || FALLBACK_BRANCH;
}

/**
 * Last `maxLines` non-empty lines of command output, in order. Success toasts
 * take a single line because `mcToastResultCard` only wraps the error tone.
 */
export function outputTail(output: string | null | undefined, maxLines: number): string {
  if (!output || maxLines <= 0) return "";
  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-maxLines)
    .join("\n");
}

/**
 * Split an API failure into message + stderr. Mirrors the rule the branch
 * checkout dialog established: drop stderr when it merely repeats the message,
 * so the toast isn't the same sentence twice.
 */
export function parseGitApiError(error: unknown): GitApiErrorParts {
  if (error instanceof ApiError) {
    const body =
      error.body && typeof error.body === "object"
        ? (error.body as {
            error?: unknown;
            stderr?: unknown;
            kind?: unknown;
            worktreeId?: unknown;
          })
        : null;
    const message =
      typeof body?.error === "string" && body.error.trim() ? body.error.trim() : error.message;
    const stderr = typeof body?.stderr === "string" ? body.stderr.trim() : undefined;
    return {
      message,
      stderr: stderr && stderr !== message ? stderr : undefined,
      kind: typeof body?.kind === "string" ? body.kind : undefined,
      worktreeId: typeof body?.worktreeId === "string" ? body.worktreeId : undefined,
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

/** Toast copy for a successful call. */
export function describeGitRemoteOutcome(
  call: GitRemoteCall,
  branch: string | null | undefined,
): GitRemoteOutcome {
  const label = branchLabel(branch);
  const base = { action: call.action, tone: "success" } as const;

  if (call.action === "fetch") {
    return {
      ...base,
      action: "fetch",
      resultKind: "fetched",
      title: `Fetched origin · ${label}`,
      detail: outputTail(call.result.output, 1) || "Remote refs up to date.",
      durationMs: SUCCESS_MS,
    };
  }

  if (call.action === "pull") {
    const modeSuffix = call.mode === "ff-only" ? "" : ` (${call.mode})`;
    if (call.result.kind === "already-up-to-date") {
      return {
        ...base,
        action: "pull",
        mode: call.mode,
        resultKind: "already-up-to-date",
        title: "Already up to date",
        detail: `${label} matches origin.`,
        durationMs: NOOP_MS,
      };
    }
    return {
      ...base,
      action: "pull",
      mode: call.mode,
      resultKind: "pulled",
      title: `Pulled ${label}${modeSuffix}`,
      detail: outputTail(call.result.output, 1) || "Pull complete.",
      durationMs: SUCCESS_MS,
    };
  }

  if (call.result.kind === "nothing-to-push") {
    return {
      ...base,
      action: "push",
      resultKind: "nothing-to-push",
      title: "Nothing to push",
      detail: `${label} is already up to date with origin.`,
      durationMs: NOOP_MS,
    };
  }
  if (call.result.setUpstream) {
    return {
      ...base,
      action: "push",
      resultKind: "pushed",
      title: `Pushed ${label} — upstream set`,
      detail: `Now tracking origin/${label}.`,
      durationMs: UPSTREAM_SET_MS,
    };
  }
  return {
    ...base,
    action: "push",
    resultKind: "pushed",
    title: `Pushed ${label}`,
    detail: outputTail(call.result.output, 1) || "Push complete.",
    durationMs: SUCCESS_MS,
  };
}

/** Toast copy for a failed call. Always sticky — the user has to read it. */
export function describeGitRemoteFailure(
  action: GitRemoteAction,
  error: unknown,
  opts: { mode?: PullMode } = {},
): GitRemoteOutcome {
  const { message, stderr } = parseGitApiError(error);
  const tail = outputTail(stderr, MAX_STDERR_LINES);
  return {
    action,
    ...(opts.mode ? { mode: opts.mode } : {}),
    resultKind: "error",
    tone: "error",
    title: `${ACTION_LABEL[action]} failed`,
    detail: tail ? `${message}\n\n${tail}` : message,
    durationMs: null,
  };
}

/**
 * Toast copy for Commit & Push, which is two calls the user asked for as one.
 * Reported as a single outcome so a normal run is one toast, not two.
 */
export function describeCommitAndPushOutcome(
  commit: CommitResult,
  push: PushResult,
  branch: string | null | undefined,
): GitRemoteOutcome {
  const label = branchLabel(branch);
  if (commit.kind === "nothing-to-commit") {
    // Nothing local to record, so the push result is the whole story.
    return describeGitRemoteOutcome({ action: "push", result: push }, branch);
  }
  const shortSha = commit.sha.slice(0, 7);
  const subject = commit.message.split("\n")[0]?.trim() || shortSha;
  if (push.kind === "nothing-to-push") {
    return {
      action: "commit",
      resultKind: "committed",
      tone: "success",
      title: `Committed ${shortSha}`,
      detail: `${subject} — nothing to push.`,
      durationMs: SUCCESS_MS,
    };
  }
  return {
    action: "commit",
    resultKind: "committed",
    tone: "success",
    title: `Committed & pushed ${label}`,
    detail: `${shortSha} ${subject}`,
    durationMs: push.setUpstream ? UPSTREAM_SET_MS : SUCCESS_MS,
  };
}

/**
 * A push that failed *after* its commit landed: keep the sha visible so it's
 * obvious the work is safe locally and only the push needs retrying.
 */
export function withCommittedPrefix(
  outcome: GitRemoteOutcome,
  commit: CommitResult,
): GitRemoteOutcome {
  if (commit.kind !== "committed") return outcome;
  return {
    ...outcome,
    detail: `Committed ${commit.sha.slice(0, 7)} locally, but the push failed.\n\n${outcome.detail}`,
  };
}

/**
 * Bell policy: every failure, plus the successes that actually moved commits.
 * "Nothing happened" outcomes (fetched refs, already-up-to-date, nothing to
 * push) still toast, but a scrollback of them is noise.
 */
export function shouldRecordInBell(outcome: GitRemoteOutcome): boolean {
  if (outcome.tone === "error") return true;
  return (
    outcome.resultKind === "pulled" ||
    outcome.resultKind === "pushed" ||
    outcome.resultKind === "committed"
  );
}

export type GitRemoteButtonState = {
  disabled: boolean;
  tooltip: string;
  ariaLabel: string;
};

/**
 * Disabled + tooltip matrix for one button. A run in flight disables all three
 * (concurrent git in one worktree contends on `index.lock`), and an unavailable
 * repo/scope disables with the reason rather than failing on click.
 */
export function gitRemoteActionButtonState({
  action,
  busyAction = null,
  enabled,
  disabledReason,
  aheadCount,
  behindCount,
}: {
  action: GitRemoteAction;
  busyAction?: GitRemoteAction | null;
  enabled: boolean;
  disabledReason?: string;
  aheadCount?: number | null;
  behindCount?: number | null;
}): GitRemoteButtonState {
  const ariaLabel = ARIA_LABEL[action];
  if (busyAction === action) {
    return { disabled: true, tooltip: BUSY_LABEL[action], ariaLabel };
  }
  if (busyAction) {
    return { disabled: true, tooltip: BUSY_LABEL[busyAction], ariaLabel };
  }
  if (!enabled) {
    return {
      disabled: true,
      tooltip: disabledReason || `${ACTION_LABEL[action]} unavailable`,
      ariaLabel,
    };
  }
  return { disabled: false, tooltip: idleTooltip(action, { aheadCount, behindCount }), ariaLabel };
}

function idleTooltip(
  action: GitRemoteAction,
  counts: { aheadCount?: number | null; behindCount?: number | null },
): string {
  if (action === "pull" && (counts.behindCount ?? 0) > 0) {
    return `Pull — ${commits(counts.behindCount!)} behind`;
  }
  if (action === "push" && (counts.aheadCount ?? 0) > 0) {
    return `Push — ${commits(counts.aheadCount!)} ahead`;
  }
  return ARIA_LABEL[action];
}

function commits(count: number): string {
  return `${count} commit${count === 1 ? "" : "s"}`;
}
