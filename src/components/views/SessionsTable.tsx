import { useState, type ReactNode } from "react";
import { Btn } from "~/components/ui/Btn";
import { CardFrame } from "~/components/ui/CardFrame";
import { STATUS_META } from "~/lib/design-meta";
import { formatRelativeTime } from "~/lib/format-relative-time";
import { isSentinelTitle } from "~/lib/task-sentinels";
import type { Task } from "~/db/schema";
import { TaskActions, type TaskActionsProps } from "./TaskActions";

export type SessionSection = {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  headerAction?: ReactNode;
};

const WINDOW_SIZE = 200;

export function SessionsTable({
  sections,
  activeId,
  pinningTaskIds,
  ...actions
}: {
  sections: SessionSection[];
  activeId: string | null;
  pinningTaskIds?: ReadonlySet<string>;
} & Omit<TaskActionsProps, "task" | "selected" | "pinning">) {
  const [showAll, setShowAll] = useState(false);
  const tasks = sections.flatMap((section) => section.tasks);
  const visibleIds = new Set(tasks.slice(0, WINDOW_SIZE).map((task) => task.id));
  if (activeId && tasks.some((task) => task.id === activeId)) visibleIds.add(activeId);
  const hiddenCount = showAll ? 0 : tasks.length - visibleIds.size;

  return (
    <div>
      <CardFrame className="mc-sessions-table-frame">
        <div className="mc-sessions-table-scroll">
          <table className="mc-sessions-table" aria-label="Sessions">
            <colgroup>
              <col />
              <col className="mc-sessions-status-col" />
              <col className="mc-sessions-updated-col" />
              <col className="mc-sessions-actions-col" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
                <th scope="col" className="mc-sessions-actions-heading">Actions</th>
              </tr>
            </thead>
            {sections.map((section) => {
              const visibleTasks = showAll
                ? section.tasks
                : section.tasks.filter((task) => visibleIds.has(task.id));
              if (visibleTasks.length === 0) return null;
              return (
                <tbody key={section.id}>
                  <tr className="mc-sessions-section">
                    <th colSpan={4} scope="rowgroup">
                      <div className="mc-sessions-section-header">
                        <span className="mc-sessions-status-dot" style={{ background: section.color }} aria-hidden />
                        <span>{section.title}</span>
                        <span className="mc-sessions-section-count">{section.tasks.length}</span>
                        {section.headerAction && <div className="mc-sessions-section-action">{section.headerAction}</div>}
                      </div>
                    </th>
                  </tr>
                  {visibleTasks.map((task) => {
                    const status = STATUS_META[task.status];
                    const selected = task.id === activeId;
                    return (
                      <tr
                        key={task.id}
                        className="mc-sessions-row"
                        data-selected={selected ? "true" : undefined}
                      >
                        <td className="mc-sessions-name">
                          <button
                            type="button"
                            className="mc-sessions-open"
                            onClick={() => actions.onToggle(task.id)}
                            aria-label={`Open terminal for ${task.title}`}
                            aria-pressed={selected}
                            data-sentinel={isSentinelTitle(task.title) ? "true" : undefined}
                          >
                            {task.title}
                          </button>
                        </td>
                        <td>
                          <span className="mc-sessions-status">
                            <span
                              className="mc-sessions-status-dot"
                              style={{ background: task.archived ? "var(--text-dim)" : status.color }}
                              aria-hidden
                            />
                            {task.archived ? "Archived" : status.label}
                          </span>
                        </td>
                        <td className="mc-sessions-updated">
                          <time dateTime={new Date(task.updatedAt).toISOString()} title={new Date(task.updatedAt).toLocaleString()}>
                            {formatRelativeTime(task.updatedAt)}
                          </time>
                        </td>
                        <td>
                          <TaskActions
                            {...actions}
                            task={task}
                            selected={selected}
                            pinning={pinningTaskIds?.has(task.id) ?? false}
                            layout="table"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      </CardFrame>
      {hiddenCount > 0 && (
        <div style={{ marginTop: 12 }}>
          <Btn variant="ghost" onClick={() => setShowAll(true)}>Show all {tasks.length}</Btn>
        </div>
      )}
    </div>
  );
}
