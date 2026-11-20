import { useState } from "react";
import { Btn } from "~/components/ui/Btn";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { HotkeyTooltip } from "~/components/ui/Tooltip";
import { useDiagrams } from "~/lib/use-diagram-events";
import type { Task } from "~/db/schema";

export type TaskActionsProps = {
  task: Task;
  selected: boolean;
  onToggle: (taskId: string) => void;
  /** Archive disconnects the terminal; running sessions require confirmation. */
  onArchive?: (taskId: string) => void;
  /** Restore an archived session back to the active list. */
  onRestore?: (taskId: string) => void;
  /** Permanently delete a session (confirmed, irreversible). */
  onDelete?: (taskId: string) => void;
  /** Pin or unpin an active session. */
  onTogglePinned?: (taskId: string) => Promise<void> | void;
  /** True while the pin/unpin mutation for this session is saving. */
  pinning?: boolean;
};

export function TaskActions({
  task,
  selected,
  onToggle,
  onArchive,
  onRestore,
  onDelete,
  onTogglePinned,
  pinning = false,
  layout = "cards",
}: TaskActionsProps & { layout?: "cards" | "table" }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const { hasDiagram, openDiagram } = useDiagrams();
  const taskHasDiagram = hasDiagram(task.id);
  const archived = task.archived;
  const isRunning = task.status === "running";
  const selectTask = () => onToggle(task.id);

  return (
    <>
      <div className="mc-session-actions" data-layout={layout}>
        <div className="mc-session-actions-primary">
          {!archived && onTogglePinned && (
            <Btn
              variant="ghost"
              size="sm"
              icon={task.pinned ? "pin-fill" : "pin"}
              disabled={pinning}
              aria-busy={pinning}
              aria-label={`${task.pinned ? "Unpin" : "Pin"} ${task.title}`}
              title={pinning ? "Saving pin state" : task.pinned ? "Unpin session" : "Pin session"}
              onClick={(e) => {
                e.stopPropagation();
                if (pinning) return;
                void onTogglePinned(task.id);
              }}
              style={{
                width: 30,
                height: 30,
                padding: 0,
                color: task.pinned ? "var(--accent-ink)" : undefined,
              }}
            />
          )}
          {archived && onRestore && (
            <Btn
              variant="ghost"
              size="sm"
              icon="refresh"
              aria-label={`Restore ${task.title}`}
              title="Restore session"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(task.id);
              }}
              style={{ width: 30, height: 30, padding: 0 }}
            />
          )}
          {!archived && onArchive && (
            <HotkeyTooltip
              action="session.closeWindow"
              label="Archive session"
              disabled={!selected}
            >
              <Btn
                variant="ghost"
                size="sm"
                icon="archive"
                aria-label={`Archive ${task.title}`}
                title={selected ? undefined : "Archive session"}
                onClick={(e) => {
                  e.stopPropagation();
                  // Running sessions lose the live terminal + agent on
                  // archive, so confirm first; parked ones archive silently.
                  if (isRunning) setConfirmArchiveOpen(true);
                  else onArchive(task.id);
                }}
                style={{ width: 30, height: 30, padding: 0 }}
              />
            </HotkeyTooltip>
          )}
          {onDelete && (
            <HotkeyTooltip
              action="session.closeWindow"
              label="Delete session"
              disabled={!selected || !archived}
            >
              <Btn
                variant="ghost"
                size="sm"
                icon="trash"
                aria-label={`Delete ${task.title}`}
                title={selected && archived ? undefined : "Delete session"}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
                style={{ width: 30, height: 30, padding: 0 }}
              />
            </HotkeyTooltip>
          )}
        </div>
        {(taskHasDiagram || task.status === "needs-input" || task.status === "interrupted") && (
          <div className="mc-session-actions-secondary">
            {taskHasDiagram && (
              <Btn
                size="sm"
                variant="ghost"
                icon="chart"
                title="View session diagram"
                aria-label="View session diagram"
                style={layout === "table" ? { width: 30, height: 30, padding: 0 } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  void openDiagram(task.id);
                }}
              >
                {layout === "cards" ? "Diagram" : null}
              </Btn>
            )}
            {(task.status === "needs-input" || task.status === "interrupted") && (
              <Btn
                size="sm"
                variant="accent"
                icon="terminal"
                aria-label={`Reply to ${task.title}`}
                title="Reply to session"
                style={layout === "table" ? { width: 30, height: 30, padding: 0 } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  selectTask();
                }}
              >
                {layout === "cards" ? "Reply" : null}
              </Btn>
            )}
          </div>
        )}
      </div>
      {onArchive && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            open={confirmArchiveOpen}
            onClose={() => setConfirmArchiveOpen(false)}
            onConfirm={() => {
              onArchive(task.id);
              setConfirmArchiveOpen(false);
            }}
            title="Archive running session?"
            confirmLabel="Archive"
            cancelLabel="Keep running"
            variant="danger"
            icon="archive"
            width={420}
          >
            <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 6, overflowWrap: "anywhere" }}>
              &ldquo;{task.title}&rdquo; is still running.
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Archiving disconnects its terminal and stops the in-progress agent.
              You can restore the session later, but the current run won&rsquo;t
              resume.
            </div>
          </ConfirmDialog>
        </div>
      )}

      {onDelete && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              onDelete(task.id);
              setConfirmOpen(false);
            }}
            title="Delete session?"
            confirmLabel="Delete"
            icon="trash"
            width={420}
          >
            <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 6, overflowWrap: "anywhere" }}>
              Delete &ldquo;{task.title}&rdquo;?
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              This permanently removes the session and closes its terminal.
              The git worktree stays. This cannot be undone.
            </div>
          </ConfirmDialog>
        </div>
      )}
    </>
  );
}
