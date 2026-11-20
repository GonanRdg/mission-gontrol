import { memo, useState } from "react";
import { CardFrame } from "~/components/ui/CardFrame";
import { ShimmerBar } from "~/components/ui/ShimmerBar";
import { AgentLogo } from "~/components/ui/AgentLogo";
import { SessionIcon } from "~/components/ui/SessionIcon";
import { AGENT_META, STATUS_META } from "~/lib/design-meta";
import { isSentinelTitle } from "~/lib/task-sentinels";
import { formatRelativeTime } from "~/lib/format-relative-time";
import { DEFAULT_SESSION_ICON, isSessionIcon } from "~/lib/session-icons";
import type { Task } from "~/db/schema";

import { TaskActions, type TaskActionsProps } from "./TaskActions";

type TaskCardProps = TaskActionsProps;

function TaskCardImpl({
  task,
  selected,
  onToggle,
  onArchive,
  onRestore,
  onDelete,
  onTogglePinned,
  pinning = false,
}: TaskCardProps) {
  const [hovered, setHovered] = useState(false);

  const meta = AGENT_META[task.agent];
  const statusMeta = STATUS_META[task.status];
  const isRunning = task.status === "running";

  // Archived sessions are parked (their tty was killed on archive), but the
  // card is still openable: clicking it reloads/resumes the session terminal.
  // Archived cards offer restore; active cards offer archive.
  const archived = task.archived;
  const actionCount = Number(!archived && !!onTogglePinned) + Number(!archived && !!onArchive) +
    Number(archived && !!onRestore) + Number(!!onDelete);

  const sentinel = isSentinelTitle(task.title);
  const sessionIcon = isSessionIcon(task.icon) ? task.icon : DEFAULT_SESSION_ICON;
  const updated = formatRelativeTime(task.updatedAt);
  // Opens/focuses the session panel. Re-clicking a selected card does not
  // close it — only the panel's hide control does.
  const selectTask = () => onToggle(task.id);

  // Subtitle: prefer the live preview line, otherwise a status hint. On the
  // archived tab everything is under "Archived", so mirror that on the card
  // instead of the underlying pre-archive status label.
  const subtitle =
    task.preview?.trim() || (archived ? "Archived" : statusMeta.label);

  return (
    <CardFrame
      glow
      focused={selected || hovered}
      style={{
        width: "100%",
        cursor: "pointer",
        transition: "box-shadow 0.15s, background 0.15s",
        // Keep the card's internal z-index layers below page-level overlays.
        zIndex: 0,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ShimmerBar active={isRunning} color={meta?.color} />
      <button
        type="button"
        onClick={selectTask}
        aria-label={`Open terminal for ${task.title}`}
        aria-pressed={selected}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          cursor: "pointer",
          borderRadius: "inherit",
        }}
      />

      {/* Agent brand watermark — faint, right side, decorative only. */}
      <div
        aria-hidden
        style={
          task.agent === "opencode"
            ? {
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 96,
                height: 120,
                backgroundImage: "url('/opencode.svg')",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "contain",
                opacity: 0.09,
                pointerEvents: "none",
                zIndex: 0,
              }
            : {
                position: "absolute",
                right: -10,
                top: "50%",
                transform: "translateY(-50%)",
                color: meta?.color ?? "var(--text)",
                opacity: 0.09,
                pointerEvents: "none",
                zIndex: 0,
                lineHeight: 0,
              }
        }
      >
        {task.agent !== "opencode" ? <AgentLogo agent={task.agent} size={140} /> : null}
      </div>

      <div
        style={{
          padding: 14,
          display: "flex",
          alignItems: "stretch",
          gap: 14,
          position: "relative",
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {/* Left icon tile + status dot */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(180deg, var(--surface-2), var(--surface-1))",
              border: "1px solid var(--border)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
            }}
          >
            <SessionIcon name={sessionIcon} size={26} strokeWidth={1.5} />
          </div>
          {statusMeta.dot && (
            <span
              style={{
                position: "absolute",
                top: -3,
                left: -3,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: statusMeta.color,
                border: "2px solid var(--surface-0)",
                boxShadow: isRunning ? `0 0 8px ${statusMeta.color}` : "none",
                animation: isRunning ? "pulse-dot 1.6s ease-in-out infinite" : "none",
              }}
            />
          )}
        </div>

        {/* Right: title / subtitle / meta row */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              lineHeight: 1.3,
              color: sentinel ? "var(--text-dim)" : "var(--text)",
              fontStyle: sentinel ? "italic" : "normal",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: actionCount * 36,
            }}
          >
            {task.title}
          </div>

          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-dim)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontStyle: !task.preview?.trim() ? "italic" : "normal",
            }}
          >
            {subtitle}
            {isRunning && task.preview?.trim() && (
              <span
                style={{
                  marginLeft: 2,
                  animation: "caret 1s infinite",
                  color: meta?.color,
                }}
              >
                ▊
              </span>
            )}
          </div>

          <div
            style={{
              marginTop: 4,
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            {updated}
          </div>
        </div>

        <TaskActions
          task={task}
          selected={selected}
          onToggle={onToggle}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          onTogglePinned={onTogglePinned}
          pinning={pinning}
        />
      </div>
    </CardFrame>
  );
}

// A Task is a flat DB row (all scalar columns), so a per-field shallow compare
// equals a deep compare — and lets an unchanged session skip re-rendering even
// when react-query hands back a freshly-parsed object on refetch.
function taskFieldsEqual(a: Task, b: Task): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof Task)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Memoized so a single session's update (one of potentially thousands of cards)
 * re-renders only that card, not the whole column. Relies on the parent passing
 * stable callback identities; task equality is compared by value above so it
 * survives react-query returning new row objects each refetch.
 */
export const TaskCard = memo(
  TaskCardImpl,
  (prev, next) =>
    prev.selected === next.selected &&
    prev.pinning === next.pinning &&
    prev.onToggle === next.onToggle &&
    prev.onArchive === next.onArchive &&
    prev.onRestore === next.onRestore &&
    prev.onDelete === next.onDelete &&
    prev.onTogglePinned === next.onTogglePinned &&
    taskFieldsEqual(prev.task, next.task),
);
