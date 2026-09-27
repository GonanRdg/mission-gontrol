import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { AgentGlyph } from "~/components/ui/AgentGlyph";
import { Btn } from "~/components/ui/Btn";
import { Icon } from "~/components/ui/Icon";
import { Kbd } from "~/components/ui/Kbd";
import { Modal } from "~/components/ui/Modal";
import { SessionIcon } from "~/components/ui/SessionIcon";
import { StatusDot } from "~/components/ui/StatusDot";
import { STATUS_META } from "~/lib/design-meta";
import { formatRelativeTime } from "~/lib/format-relative-time";
import { requestSessionOpenById } from "~/lib/session-notification-store";
import { useSessionSwitcher } from "~/lib/session-switcher-store";
import type { ActiveSessionGroup, ActiveSessionSummary } from "~/shared/active-sessions";

function sessionCount(groups: ActiveSessionGroup[]): number {
  return groups.reduce((total, group) => total + group.sessions.length, 0);
}

export function SessionSwitcherPalette() {
  const router = useRouter();
  const { close, isError, isLoading, isOpen, retry, sessions } = useSessionSwitcher();
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const nowRef = useRef(Date.now());
  const rows = useMemo(
    () => [
      ...(sessions?.live.flatMap((group) => group.sessions) ?? []),
      ...(sessions?.recentlyFinished.flatMap((group) => group.sessions) ?? []),
    ],
    [sessions],
  );
  const liveCount = sessionCount(sessions?.live ?? []);

  useEffect(() => {
    if (!isOpen) return;
    nowRef.current = Date.now();
    setHighlightedId(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || (highlightedId && rows.some((row) => row.taskId === highlightedId))) return;
    const firstId = rows[0]?.taskId ?? null;
    setHighlightedId(firstId);
    const timeout = window.setTimeout(() => {
      if (firstId) itemRefs.current.get(firstId)?.focus();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [highlightedId, isOpen, rows]);

  const select = (session: ActiveSessionSummary) => {
    close();
    requestSessionOpenById({
      projectId: session.projectId,
      worktreeId: session.worktreeId,
      scopeId: session.scopeId,
      taskId: session.taskId,
    });
    void router.navigate({ to: "/projects/$id", params: { id: session.projectId } });
  };

  const moveHighlight = (currentId: string, direction: 1 | -1) => {
    const index = rows.findIndex((row) => row.taskId === currentId);
    if (index < 0 || rows.length === 0) return;
    const next = rows[(index + direction + rows.length) % rows.length];
    if (!next) return;
    setHighlightedId(next.taskId);
    itemRefs.current.get(next.taskId)?.focus();
  };

  const renderGroups = (groups: ActiveSessionGroup[]) =>
    groups.map((group) => (
      <div key={group.projectId} style={{ display: "grid", gap: 3 }}>
        <div
          style={{
            padding: "7px 10px 3px",
            color: "var(--text-faint)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {group.projectName}
        </div>
        {group.sessions.map((session) => {
          const highlighted = highlightedId === session.taskId;
          return (
            <button
              key={session.taskId}
              ref={(node) => {
                if (node) itemRefs.current.set(session.taskId, node);
                else itemRefs.current.delete(session.taskId);
              }}
              type="button"
              className="mc-session-switcher-row"
              onClick={() => select(session)}
              onFocus={() => setHighlightedId(session.taskId)}
              onMouseEnter={() => setHighlightedId(session.taskId)}
              onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveHighlight(session.taskId, event.key === "ArrowDown" ? 1 : -1);
                }
              }}
              aria-label={`${session.title}, ${group.projectName}, ${STATUS_META[session.status].label}`}
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "28px minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                border: "1px solid",
                borderColor: highlighted ? "var(--accent-border)" : "transparent",
                borderRadius: 7,
                background: highlighted ? "var(--accent-faint)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--surface-2)",
                  color: "var(--text-dim)",
                }}
              >
                <SessionIcon name={session.icon} size={15} />
              </span>
              <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12.5,
                    fontWeight: 550,
                  }}
                >
                  {session.title}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                    color: "var(--text-faint)",
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                  }}
                >
                  <StatusDot status={session.status} />
                  <span>{STATUS_META[session.status].label}</span>
                  <span aria-hidden>·</span>
                  <AgentGlyph agent={session.agent} size={9} />
                  {session.action && (
                    <>
                      <span aria-hidden>·</span>
                      <span
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {session.action}
                      </span>
                    </>
                  )}
                </span>
              </span>
              <span
                style={{
                  paddingLeft: 8,
                  color: "var(--text-faint)",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  whiteSpace: "nowrap",
                }}
              >
                {formatRelativeTime(session.updatedAt, nowRef.current)}
              </span>
            </button>
          );
        })}
      </div>
    ));

  const footer = rows.length > 0 ? (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        color: "var(--text-faint)",
        fontFamily: "var(--mono)",
        fontSize: 10,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> navigate
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Kbd>↵</Kbd> open session
      </span>
    </div>
  ) : undefined;

  return (
    <Modal
      open={isOpen}
      onClose={close}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="terminal" size={13} style={{ color: "var(--accent)" }} />
          <span>Sessions</span>
          {liveCount > 0 && (
            <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
              {liveCount} live
            </span>
          )}
        </span>
      }
      width={620}
      maxHeight="72vh"
      placement="top"
      contentStyle={{ padding: 6 }}
      footer={footer}
    >
      {isLoading && !sessions ? (
        <div style={emptyStyle}>Loading sessions…</div>
      ) : isError && !sessions ? (
        <div style={{ ...emptyStyle, display: "grid", justifyItems: "center", gap: 10 }}>
          <span>Could not load sessions.</span>
          <Btn variant="ghost" icon="refresh" onClick={retry}>
            Retry
          </Btn>
        </div>
      ) : rows.length === 0 ? (
        <div style={emptyStyle}>No live or recently finished sessions.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {(sessions?.live.length ?? 0) > 0 && (
            <section aria-labelledby="session-switcher-live">
              <h2 id="session-switcher-live" style={sectionHeadingStyle}>Live</h2>
              {renderGroups(sessions?.live ?? [])}
            </section>
          )}
          {(sessions?.recentlyFinished.length ?? 0) > 0 && (
            <section aria-labelledby="session-switcher-recent">
              <h2 id="session-switcher-recent" style={sectionHeadingStyle}>Recently finished</h2>
              {renderGroups(sessions?.recentlyFinished ?? [])}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

const emptyStyle = {
  padding: 28,
  color: "var(--text-faint)",
  fontFamily: "var(--mono)",
  fontSize: 12,
  textAlign: "center" as const,
};

const sectionHeadingStyle = {
  margin: 0,
  padding: "8px 10px 4px",
  color: "var(--text-dim)",
  fontFamily: "var(--mono)",
  fontSize: 11,
  fontWeight: 650,
  letterSpacing: "0.02em",
};
