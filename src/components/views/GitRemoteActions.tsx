import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "~/components/ui/Btn";
import { CardFrame } from "~/components/ui/CardFrame";
import { DropdownMenuItem, DropdownMenuSeparator } from "~/components/ui/DropdownMenuItem";
import { Icon } from "~/components/ui/Icon";
import { Tooltip } from "~/components/ui/Tooltip";
import { gitHandoffFailureFromOutcome, type GitHandoffContext } from "~/lib/git-handoff-prompt";
import {
  describeCommitAndPushOutcome,
  describeGitRemoteFailure,
  describeGitRemoteOutcome,
  gitRemoteActionButtonState,
  parseGitApiError,
  shouldRecordInBell,
  withCommittedPrefix,
  type GitRemoteAction,
  type GitRemoteOutcome,
} from "~/lib/git-remote-action-result";
import { mcToastResultCard } from "~/lib/mc-toast";
import { openExternal } from "~/lib/open-external";
import { recordGitRemoteActionNotification } from "~/lib/session-notification-store";
import { useSuspendAppDragRegion } from "~/lib/use-dismissable-menu";
import { VOICE_SHIP_EVENT } from "~/lib/voice-events";
import { Z_INDEX } from "~/lib/z-index";
import {
  useGitCommit,
  useGitCreatePullRequest,
  useGitFetch,
  useGitPull,
  useGitPush,
} from "~/queries/git";
import type { CommitResult, PullMode } from "~/server/services/git";
import { CommitMessageDialog } from "~/components/views/CommitMessageDialog";
import { GitHistoryModal } from "~/components/views/GitHistoryModal";
import { MAIN_WORKTREE_ID } from "~/shared/worktrees";

export type GitHandoffFailure = NonNullable<GitHandoffContext["failure"]>;

/**
 * The project's git control: Fetch as the primary click (the one action that
 * cannot lose work), everything else behind the chevron.
 *
 * All of it is plain git over the HTTP API — no agent session, no tokens. The
 * one AI path is `onHandOffToAgent`, offered from the menu and from every
 * failure toast, for what git genuinely dead-ends on: conflicts, a rejected
 * push, a tree that needs judgement.
 *
 * The API always targets the HOST repo, so callers must pass `enabled: false`
 * outside the local scope and say why in `disabledReason`.
 */
export function GitRemoteActions({
  projectId,
  worktreeId,
  scopeId,
  projectName,
  branch,
  aheadCount,
  behindCount,
  enabled,
  disabledReason,
  size = "md",
  onHandOffToAgent,
}: {
  projectId: string;
  /** Already normalized: `null` for the main worktree. */
  worktreeId: string | null;
  scopeId: string;
  projectName: string;
  branch: string | null | undefined;
  aheadCount?: number | null;
  behindCount?: number | null;
  enabled: boolean;
  /** Tooltip shown while disabled — say *why*, not just "unavailable". */
  disabledReason?: string;
  size?: "sm" | "md";
  /** Opens an agent session seeded with the situation; omit to hide the option. */
  onHandOffToAgent?: (failure?: GitHandoffFailure) => void;
}) {
  const fetchM = useGitFetch(projectId, worktreeId);
  const pullM = useGitPull(projectId, worktreeId);
  const pushM = useGitPush(projectId, worktreeId);
  const commitM = useGitCommit(projectId, worktreeId);
  const prM = useGitCreatePullRequest(projectId, worktreeId);

  const [manualCommitReason, setManualCommitReason] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useSuspendAppDragRegion(menuOpen);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLElement>(null);

  // One git run at a time: concurrent operations in the same worktree contend
  // on `.git/index.lock`, and a fetch landing mid-pull reads as a phantom.
  const busyAction: GitRemoteAction | null = fetchM.isPending
    ? "fetch"
    : pullM.isPending
      ? "pull"
      : commitM.isPending
        ? "commit"
        : pushM.isPending
          ? "push"
          : null;

  // Toast every outcome; keep the ones worth a scrollback in the bell, and give
  // failures a one-click route to an agent that starts from the actual error.
  const report = useCallback(
    (outcome: GitRemoteOutcome) => {
      const handOff = onHandOffToAgent;
      mcToastResultCard(
        {
          tone: outcome.tone,
          title: outcome.title,
          detail: outcome.detail,
          action:
            outcome.tone === "error" && handOff
              ? {
                  label: "Hand off to agent",
                  onClick: () => handOff(gitHandoffFailureFromOutcome(outcome)),
                }
              : undefined,
        },
        // Failures are sticky: the user has to read the stderr, and a 4s toast
        // is gone before a long git message can be scanned.
        { duration: outcome.durationMs ?? Infinity },
      );
      if (!shouldRecordInBell(outcome)) return;
      const at = Date.now();
      recordGitRemoteActionNotification({
        id: `${projectId}:${worktreeId ?? MAIN_WORKTREE_ID}:${outcome.action}:${at}`,
        projectId,
        worktreeId,
        scopeId,
        projectName,
        action: outcome.action,
        tone: outcome.tone,
        title: outcome.title,
        detail: outcome.detail,
        createdAt: at,
      });
    },
    [onHandOffToAgent, projectId, projectName, scopeId, worktreeId],
  );

  const runFetch = useCallback(async () => {
    if (busyAction) return;
    try {
      const result = await fetchM.mutateAsync();
      report(describeGitRemoteOutcome({ action: "fetch", result }, branch));
    } catch (e) {
      report(describeGitRemoteFailure("fetch", e));
    }
  }, [branch, busyAction, fetchM, report]);

  const runPull = useCallback(
    async (mode: PullMode) => {
      if (busyAction) return;
      try {
        // Pass the mode explicitly even for the default so the call site never
        // lies about which strategy was requested.
        const result = await pullM.mutateAsync(mode);
        report(describeGitRemoteOutcome({ action: "pull", mode, result }, branch));
      } catch (e) {
        report(describeGitRemoteFailure("pull", e, { mode }));
      }
    },
    [branch, busyAction, pullM, report],
  );

  const runPush = useCallback(async () => {
    if (busyAction) return;
    try {
      const result = await pushM.mutateAsync();
      report(describeGitRemoteOutcome({ action: "push", result }, branch));
    } catch (e) {
      report(describeGitRemoteFailure("push", e));
    }
  }, [branch, busyAction, pushM, report]);

  // Commit & Push: the server stages everything and has the configured commit
  // CLI write the message (one short call, not a session). `message` is only
  // passed when the user typed one in the fallback dialog.
  const runCommitAndPush = useCallback(
    async (message?: string) => {
      if (busyAction) return;
      let commit: CommitResult;
      try {
        commit = await commitM.mutateAsync(message ? { message } : {});
      } catch (e) {
        const kind = parseGitApiError(e).kind;
        if (!message && kind && MANUAL_MESSAGE_KINDS.has(kind)) {
          setManualCommitReason(parseGitApiError(e).message);
          return;
        }
        report(describeGitRemoteFailure("commit", e));
        return;
      }
      setManualCommitReason(null);
      try {
        const push = await pushM.mutateAsync();
        report(describeCommitAndPushOutcome(commit, push, branch));
      } catch (e) {
        report(withCommittedPrefix(describeGitRemoteFailure("push", e), commit));
      }
    },
    [branch, busyAction, commitM, pushM, report],
  );

  // Create PR goes straight through `gh` on the server; when gh isn't installed
  // the server hands back a compare URL, which is still a useful outcome rather
  // than an error.
  const runCreatePullRequest = useCallback(async () => {
    if (busyAction || prM.isPending) return;
    try {
      const result = await prM.mutateAsync();
      if (result.kind === "gh-missing") {
        openExternal(result.compareUrl);
        mcToastResultCard(
          {
            tone: "success",
            title: "Opened the compare page",
            detail: `GitHub CLI (gh) isn't installed — open the PR from ${result.branch} into ${result.baseBranch} in the browser.`,
          },
          { duration: 6_000 },
        );
        return;
      }
      openExternal(result.url);
      mcToastResultCard(
        {
          tone: "success",
          title: result.kind === "created" ? "Pull request created" : "Pull request already open",
          detail: result.url,
        },
        { duration: 5_000 },
      );
    } catch (e) {
      const { message, stderr } = parseGitApiError(e);
      const handOff = onHandOffToAgent;
      mcToastResultCard(
        {
          tone: "error",
          title: "Create pull request failed",
          detail: stderr ? `${message}\n\n${stderr}` : message,
          action: handOff
            ? {
                label: "Hand off to agent",
                onClick: () => handOff({ action: "push", message }),
              }
            : undefined,
        },
        { duration: Infinity },
      );
    }
  }, [busyAction, onHandOffToAgent, prM]);

  // "Ship it" — from voice control or the project.ship hotkey — means Commit &
  // Push now that no agent session is involved.
  useEffect(() => {
    const onShipIntent = () => void runCommitAndPush();
    window.addEventListener(VOICE_SHIP_EVENT, onShipIntent);
    return () => window.removeEventListener(VOICE_SHIP_EVENT, onShipIntent);
  }, [runCommitAndPush]);

  const updateMenuRect = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [menuOpen, updateMenuRect]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const stateFor = (action: GitRemoteAction) =>
    gitRemoteActionButtonState({
      action,
      busyAction,
      enabled,
      disabledReason,
      aheadCount,
      behindCount,
    });

  const fetchState = stateFor("fetch");
  const pullState = stateFor("pull");
  const pushState = stateFor("push");
  const commitState = stateFor("commit");

  const runFromMenu = (run: () => void) => () => {
    setMenuOpen(false);
    run();
  };

  return (
    <div
      ref={anchorRef}
      role="group"
      aria-label="Git actions"
      style={{ display: "inline-flex", alignItems: "center", gap: 0 }}
    >
      <Tooltip content={fetchState.tooltip}>
        <Btn
          variant="ghost"
          size={size}
          icon="refresh"
          className="mc-btn-attached-right mc-git-fetch-button"
          onClick={runFetch}
          disabled={fetchState.disabled}
          aria-label={fetchState.ariaLabel}
          style={{ fontFamily: "var(--mono)" }}
        >
          <span className="mc-git-fetch-label">
            {busyAction ? BUSY_LABEL[busyAction] : "Fetch"}
          </span>
        </Btn>
      </Tooltip>
      <Btn
        variant="ghost"
        size={size}
        className="mc-btn-attached-left"
        onClick={() => setMenuOpen((v) => !v)}
        disabled={!enabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More git actions"
        title={enabled ? "More git actions" : disabledReason}
        style={{ minWidth: 26, paddingInline: 0 }}
      >
        <Icon
          name="chevron-down"
          size={13}
          style={{
            flexShrink: 0,
            transform: menuOpen ? "rotate(180deg)" : undefined,
            transition: "transform 120ms ease",
          }}
        />
      </Btn>

      {menuOpen &&
        menuRect &&
        createPortal(
          <CardFrame
            ref={menuRef}
            role="menu"
            aria-label="Git actions"
            solid
            className="mc-project-actions-menu"
            style={{
              position: "fixed",
              top: menuRect.top,
              right: menuRect.right,
              minWidth: 240,
              boxShadow: "0 14px 32px rgba(0,0,0,0.42)",
              zIndex: Z_INDEX.popover,
            }}
          >
            <DropdownMenuItem
              icon="download"
              disabled={pullState.disabled}
              onClick={runFromMenu(() => void runPull("ff-only"))}
              title="Fast-forward only — fails rather than creating a merge commit"
            >
              <MenuRow label="Pull (fast-forward)" count={behindCount} prefix="↓" />
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="refresh"
              disabled={pullState.disabled}
              onClick={runFromMenu(() => void runPull("rebase"))}
              title="Replay local commits on top of the remote branch"
            >
              Pull with rebase
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="git-branch"
              disabled={pullState.disabled}
              onClick={runFromMenu(() => void runPull("merge"))}
              title="Merge the remote branch into the local one"
            >
              Pull with merge
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="check"
              disabled={commitState.disabled}
              onClick={runFromMenu(() => void runCommitAndPush())}
              title="Stage everything, commit with a generated message, then push"
            >
              Commit &amp; Push
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="upload"
              disabled={pushState.disabled}
              onClick={runFromMenu(runPush)}
              title="Push this branch to origin, setting upstream if it has none"
            >
              <MenuRow label="Push" count={aheadCount} prefix="↑" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon="list"
              disabled={!enabled}
              onClick={runFromMenu(() => setHistoryOpen(true))}
              title="Browse commits across local and fetched remote branches"
            >
              Commit history
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="github"
              disabled={!enabled || prM.isPending}
              onClick={runFromMenu(() => void runCreatePullRequest())}
              title="Open a pull request for this branch with the GitHub CLI"
            >
              {prM.isPending ? "Opening pull request…" : "Create pull request"}
            </DropdownMenuItem>
            {onHandOffToAgent && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon="sparkles"
                  onClick={runFromMenu(() => onHandOffToAgent())}
                  title="Open an agent session with the situation written out, ready for you to send"
                >
                  Hand off to agent…
                </DropdownMenuItem>
              </>
            )}
          </CardFrame>,
          document.body,
        )}

      <CommitMessageDialog
        open={manualCommitReason !== null}
        reason={manualCommitReason}
        busy={busyAction === "commit"}
        onClose={() => setManualCommitReason(null)}
        onCommit={(message) => void runCommitAndPush(message)}
      />
      <GitHistoryModal
        open={historyOpen}
        projectId={projectId}
        worktreeId={worktreeId}
        projectName={projectName}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}

/**
 * Menu row with the action name on the left and its pending-commit count on the
 * right. The count is deliberately NOT part of the label: reading
 * "Pull — 5 commits behind" as an item name makes the default fast-forward pull
 * look like a fourth strategy rather than the plain one.
 */
function MenuRow({
  label,
  count,
  prefix,
}: {
  label: string;
  count?: number | null;
  prefix: "↓" | "↑";
}) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {(count ?? 0) > 0 && (
        <span
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            color: "var(--text-faint)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {prefix}
          {count}
        </span>
      )}
    </span>
  );
}

const BUSY_LABEL: Record<GitRemoteAction, string> = {
  fetch: "Fetching…",
  pull: "Pulling…",
  push: "Pushing…",
  commit: "Committing…",
};

/** Server error kinds that mean "the CLI couldn't write a message" — ask the user. */
const MANUAL_MESSAGE_KINDS = new Set(["no-commit-cli", "commit-generation-failed"]);

// Busy state is `disabled` + a progress label, with the dimming left to
// `.mc-btn:disabled`. Two things NOT to do here:
//  - stack an inline opacity on top of it: the compounded alpha fades the
//    painted border-image frame's outer pixels and the button reads as having
//    physically shrunk.
//  - swap the icon for a <Spinner>: `Btn`'s `icon` prop takes an IconName, so a
//    spinner has to go in `children`, which fights the label.
