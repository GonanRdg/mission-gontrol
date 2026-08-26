import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "~/components/ui/Btn";
import { CardFrame } from "~/components/ui/CardFrame";
import { DropdownMenuItem } from "~/components/ui/DropdownMenuItem";
import { Icon } from "~/components/ui/Icon";
import { Tooltip } from "~/components/ui/Tooltip";
import {
  describeGitRemoteFailure,
  describeGitRemoteOutcome,
  gitRemoteActionButtonState,
  type GitRemoteAction,
  type GitRemoteOutcome,
} from "~/lib/git-remote-action-result";
import { shouldRecordInBell } from "~/lib/git-remote-action-result";
import { mcToastResultCard } from "~/lib/mc-toast";
import { recordGitRemoteActionNotification } from "~/lib/session-notification-store";
import { useSuspendAppDragRegion } from "~/lib/use-dismissable-menu";
import { Z_INDEX } from "~/lib/z-index";
import { useGitFetch, useGitPull, useGitPush } from "~/queries/git";
import type { PullMode } from "~/server/services/git";
import { MAIN_WORKTREE_ID } from "~/shared/worktrees";

/**
 * Fetch / Pull ▾ / Push against the selected project + worktree.
 *
 * These run real git over the HTTP API (no AI session — that's Ship/Sync), and
 * the API always operates on the HOST repo, so the caller must pass
 * `enabled: false` outside the local scope; see `disabledReason`.
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
}) {
  const fetchM = useGitFetch(projectId, worktreeId);
  const pullM = useGitPull(projectId, worktreeId);
  const pushM = useGitPush(projectId, worktreeId);

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
      : pushM.isPending
        ? "push"
        : null;

  // Toast every outcome; keep the ones worth a scrollback in the bell, so a
  // failure survives being looked away from.
  const report = useCallback(
    (outcome: GitRemoteOutcome) => {
      showOutcome(outcome);
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
    [projectId, projectName, scopeId, worktreeId],
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
  const iconStyle = size === "sm" ? SM_ICON_STYLE : MD_ICON_STYLE;

  return (
    <div
      role="group"
      aria-label="Git remote actions"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <Tooltip content={fetchState.tooltip}>
        <Btn
          variant="ghost"
          size={size}
          icon="refresh"
          onClick={runFetch}
          disabled={fetchState.disabled}
          aria-label={fetchState.ariaLabel}
          style={{ ...iconStyle, opacity: fetchState.disabled ? BUSY_OPACITY : 1 }}
        />
      </Tooltip>

      <div ref={anchorRef} style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
        <Tooltip content={pullState.tooltip}>
          <Btn
            variant="ghost"
            size={size}
            icon="download"
            className="mc-btn-attached-right"
            onClick={() => void runPull("ff-only")}
            disabled={pullState.disabled}
            aria-label={pullState.ariaLabel}
            style={{ ...iconStyle, opacity: pullState.disabled ? BUSY_OPACITY : 1 }}
          />
        </Tooltip>
        <Btn
          variant="ghost"
          size={size}
          className="mc-btn-attached-left"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={pullState.disabled}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More pull strategies"
          title="More pull strategies"
          style={{ minWidth: 24, paddingInline: 0, opacity: pullState.disabled ? BUSY_OPACITY : 1 }}
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
      </div>

      <Tooltip content={pushState.tooltip}>
        <Btn
          variant="ghost"
          size={size}
          icon="upload"
          onClick={runPush}
          disabled={pushState.disabled}
          aria-label={pushState.ariaLabel}
          style={{ ...iconStyle, opacity: pushState.disabled ? BUSY_OPACITY : 1 }}
        />
      </Tooltip>

      {menuOpen &&
        menuRect &&
        createPortal(
          <CardFrame
            ref={menuRef}
            role="menu"
            aria-label="More pull strategies"
            solid
            className="mc-project-actions-menu"
            style={{
              position: "fixed",
              top: menuRect.top,
              right: menuRect.right,
              minWidth: 220,
              boxShadow: "0 14px 32px rgba(0,0,0,0.42)",
              zIndex: Z_INDEX.popover,
            }}
          >
            <DropdownMenuItem
              icon="refresh"
              onClick={() => {
                setMenuOpen(false);
                void runPull("rebase");
              }}
              title="Replay local commits on top of the remote branch"
            >
              Pull with rebase
            </DropdownMenuItem>
            <DropdownMenuItem
              icon="git-branch"
              onClick={() => {
                setMenuOpen(false);
                void runPull("merge");
              }}
              title="Merge the remote branch into the local one"
            >
              Pull with merge
            </DropdownMenuItem>
          </CardFrame>,
          document.body,
        )}
    </div>
  );
}

// A spinner can't go through `Btn`'s `icon` prop, and swapping to `children`
// changes the button's intrinsic width mid-flight — which jitters the whole
// header band. Busy reads as dimmed + disabled + a progress tooltip instead.
const BUSY_OPACITY = 0.55;
const MD_ICON_STYLE = { width: 40, minWidth: 40, paddingInline: 0 } as const;
const SM_ICON_STYLE = { width: 34, minWidth: 34, paddingInline: 0 } as const;

function showOutcome(outcome: GitRemoteOutcome): void {
  mcToastResultCard(
    { tone: outcome.tone, title: outcome.title, detail: outcome.detail },
    // Failures are sticky: the user has to read the stderr, and a 4s toast is
    // gone before a long git message can be scanned.
    { duration: outcome.durationMs ?? Infinity },
  );
}
