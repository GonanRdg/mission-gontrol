import { LOCAL_SCOPE_ID, normalizeScopeId } from "~/shared/sandbox";

export type SessionFinishNotification = {
  kind: "session-finished";
  id: string;
  projectId: string;
  worktreeId: string | null;
  scopeId: string;
  projectName: string;
  taskTitle: string;
  finishedAt: number;
};

export type DiagramReadyNotification = {
  kind: "diagram-ready";
  diagramId: string;
  taskId: string;
  projectId: string;
  worktreeId: string | null;
  scopeId: string;
  projectName: string;
  taskTitle: string;
  diagramTitle: string | null;
  createdAt: number;
};

/**
 * A git fetch/pull/push run from the project header. Unlike the other kinds
 * this one is written by the renderer itself rather than by a server event, so
 * a sticky toast is not the only record of what git said.
 */
export type GitRemoteActionNotification = {
  kind: "git-remote-action";
  id: string;
  projectId: string;
  worktreeId: string | null;
  scopeId: string;
  projectName: string;
  action: "fetch" | "pull" | "push";
  tone: "success" | "error";
  title: string;
  /** Full toast detail, including stderr. Rows clip it; the tooltip shows it all. */
  detail: string;
  createdAt: number;
};

export type AppNotification =
  | SessionFinishNotification
  | DiagramReadyNotification
  | GitRemoteActionNotification;

export type SessionNotificationPruneTarget =
  | { type: "task"; taskId: string; projectId?: string }
  | { type: "diagram"; diagramId: string; projectId: string }
  | { type: "project"; projectId: string }
  | { type: "worktree"; projectId: string; worktreeId: string | null }
  // Entries with no task/diagram behind them are cleared by their own id.
  | { type: "notification-id"; id: string };

export type PendingNotificationOpen = {
  kind: "session-finished" | "diagram-ready";
  projectId: string;
  worktreeId: string | null;
  scopeId: string;
  taskId: string;
  diagramId?: string;
  requestedAt: number;
};

/** @deprecated Use PendingNotificationOpen */
export type PendingSessionOpen = PendingNotificationOpen;

export const SESSION_NOTIFICATION_OPEN_EVENT = "mc:session-notification-open";
export const DIAGRAM_NOTIFICATION_OPEN_EVENT = "mc:diagram-notification-open";
export const SESSION_NOTIFICATIONS_CHANGED_EVENT =
  "mc:session-notifications-changed";

const NOTIFICATIONS_KEY = "mc:sessionFinishNotifications";
// Hard cap on the in-app notification list. Every load/merge/persist path funnels
// through sortNotifications (newest-first), so slicing there keeps the 200 most
// recent and drops the oldest, bounding localStorage growth. Behavior-preserving
// for anyone under the cap.
const MAX_NOTIFICATIONS = 200;
const PENDING_OPEN_KEY = "mc:pendingSessionOpen";
const PENDING_DIAGRAM_OPEN_KEY = "mc:pendingDiagramOpen";
const PENDING_OPEN_MAX_AGE_MS = 5 * 60_000;

export const SESSION_FINISH_NOTIFICATIONS_STORAGE_KEY = NOTIFICATIONS_KEY;

function parseStoredScopeId(value: Record<string, unknown>): string {
  return normalizeScopeId(
    typeof value.scopeId === "string" ? value.scopeId : LOCAL_SCOPE_ID,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function notificationTimestamp(notification: AppNotification): number {
  switch (notification.kind) {
    case "session-finished":
      return notification.finishedAt;
    case "diagram-ready":
    case "git-remote-action":
      return notification.createdAt;
  }
}

function toSessionFinishNotification(
  value: Record<string, unknown>,
): SessionFinishNotification | null {
  const id = typeof value.id === "string" ? value.id : "";
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  if (!("worktreeId" in value)) return null;
  const worktreeId = typeof value.worktreeId === "string" ? value.worktreeId : null;
  const projectName = typeof value.projectName === "string" ? value.projectName : "Project";
  const taskTitle = typeof value.taskTitle === "string" ? value.taskTitle : "Session";
  const finishedAt = typeof value.finishedAt === "number" ? value.finishedAt : 0;
  if (!id || !projectId || !Number.isFinite(finishedAt)) return null;
  return {
    kind: "session-finished",
    id,
    projectId,
    worktreeId,
    scopeId: parseStoredScopeId(value),
    projectName,
    taskTitle,
    finishedAt,
  };
}

function toDiagramReadyNotification(
  value: Record<string, unknown>,
): DiagramReadyNotification | null {
  const diagramId = typeof value.diagramId === "string" ? value.diagramId : "";
  const taskId = typeof value.taskId === "string" ? value.taskId : "";
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  if (!("worktreeId" in value)) return null;
  const worktreeId = typeof value.worktreeId === "string" ? value.worktreeId : null;
  const projectName = typeof value.projectName === "string" ? value.projectName : "Project";
  const taskTitle = typeof value.taskTitle === "string" ? value.taskTitle : "Session";
  const diagramTitle =
    typeof value.diagramTitle === "string" ? value.diagramTitle : null;
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0;
  if (!diagramId || !taskId || !projectId || !Number.isFinite(createdAt)) return null;
  return {
    kind: "diagram-ready",
    diagramId,
    taskId,
    projectId,
    worktreeId,
    scopeId: parseStoredScopeId(value),
    projectName,
    taskTitle,
    diagramTitle,
    createdAt,
  };
}

function toGitRemoteActionNotification(
  value: Record<string, unknown>,
): GitRemoteActionNotification | null {
  const id = typeof value.id === "string" ? value.id : "";
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  if (!("worktreeId" in value)) return null;
  const worktreeId = typeof value.worktreeId === "string" ? value.worktreeId : null;
  const projectName = typeof value.projectName === "string" ? value.projectName : "Project";
  const action =
    value.action === "fetch" || value.action === "pull" || value.action === "push"
      ? value.action
      : null;
  const title = typeof value.title === "string" ? value.title : "";
  const detail = typeof value.detail === "string" ? value.detail : "";
  const createdAt = typeof value.createdAt === "number" ? value.createdAt : 0;
  if (!id || !projectId || !action || !title || !Number.isFinite(createdAt)) return null;
  return {
    kind: "git-remote-action",
    id,
    projectId,
    worktreeId,
    scopeId: parseStoredScopeId(value),
    projectName,
    action,
    tone: value.tone === "error" ? "error" : "success",
    title,
    detail,
    createdAt,
  };
}

// Unknown kinds fall through to the session parser, so every kind added to
// AppNotification needs a branch here or its stored rows are coerced into
// session-finished entries on the next load.
function toNotification(value: unknown): AppNotification | null {
  if (!isRecord(value)) return null;
  if (value.kind === "diagram-ready") return toDiagramReadyNotification(value);
  if (value.kind === "git-remote-action") return toGitRemoteActionNotification(value);
  return toSessionFinishNotification(value);
}

function toPendingOpen(value: unknown): PendingNotificationOpen | null {
  if (!isRecord(value)) return null;
  const kind =
    value.kind === "diagram-ready" ? "diagram-ready" : "session-finished";
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  if (!("worktreeId" in value)) return null;
  const worktreeId = typeof value.worktreeId === "string" ? value.worktreeId : null;
  const taskId = typeof value.taskId === "string" ? value.taskId : "";
  const diagramId = typeof value.diagramId === "string" ? value.diagramId : undefined;
  const requestedAt = typeof value.requestedAt === "number" ? value.requestedAt : 0;
  if (!projectId || !taskId || !Number.isFinite(requestedAt)) return null;
  if (kind === "diagram-ready" && !diagramId) return null;
  return {
    kind,
    projectId,
    worktreeId,
    scopeId: parseStoredScopeId(value),
    taskId,
    diagramId,
    requestedAt,
  };
}

function sortNotifications(notifications: AppNotification[]): AppNotification[] {
  return [...notifications]
    .sort((a, b) => notificationTimestamp(b) - notificationTimestamp(a))
    .slice(0, MAX_NOTIFICATIONS);
}

export function loadAppNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortNotifications(
      parsed
        .map(toNotification)
        .filter((n): n is AppNotification => !!n),
    );
  } catch {
    return [];
  }
}

/** @deprecated Use loadAppNotifications */
export function loadSessionFinishNotifications(): SessionFinishNotification[] {
  return loadAppNotifications().filter(
    (notification): notification is SessionFinishNotification =>
      notification.kind === "session-finished",
  );
}

export function saveAppNotifications(notifications: AppNotification[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch {
    /* quota or privacy-mode storage */
  }
}

const EMPTY_DIAGRAM_READY_NOTIFICATIONS: DiagramReadyNotification[] = [];

let diagramReadySnapshot: DiagramReadyNotification[] = EMPTY_DIAGRAM_READY_NOTIFICATIONS;

function diagramReadyNotificationsEqual(
  left: DiagramReadyNotification[],
  right: DiagramReadyNotification[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.diagramId !== b.diagramId ||
      a.projectId !== b.projectId ||
      a.taskId !== b.taskId ||
      a.createdAt !== b.createdAt
    ) {
      return false;
    }
  }
  return true;
}

function extractDiagramReadyNotifications(
  notifications: AppNotification[],
): DiagramReadyNotification[] {
  const next = notifications.filter(
    (notification): notification is DiagramReadyNotification =>
      notification.kind === "diagram-ready",
  );
  return next.length === 0 ? EMPTY_DIAGRAM_READY_NOTIFICATIONS : next;
}

function syncDiagramReadySnapshot(source?: AppNotification[]) {
  const next = extractDiagramReadyNotifications(source ?? loadAppNotifications());
  if (!diagramReadyNotificationsEqual(diagramReadySnapshot, next)) {
    diagramReadySnapshot = next;
  }
}

const EMPTY_GIT_REMOTE_ACTION_NOTIFICATIONS: GitRemoteActionNotification[] = [];

let gitRemoteActionSnapshot: GitRemoteActionNotification[] =
  EMPTY_GIT_REMOTE_ACTION_NOTIFICATIONS;

function gitRemoteActionNotificationsEqual(
  left: GitRemoteActionNotification[],
  right: GitRemoteActionNotification[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (a.id !== b.id || a.projectId !== b.projectId || a.createdAt !== b.createdAt) {
      return false;
    }
  }
  return true;
}

function extractGitRemoteActionNotifications(
  notifications: AppNotification[],
): GitRemoteActionNotification[] {
  const next = notifications.filter(
    (notification): notification is GitRemoteActionNotification =>
      notification.kind === "git-remote-action",
  );
  return next.length === 0 ? EMPTY_GIT_REMOTE_ACTION_NOTIFICATIONS : next;
}

function syncGitRemoteActionSnapshot(source?: AppNotification[]) {
  const next = extractGitRemoteActionNotifications(source ?? loadAppNotifications());
  if (!gitRemoteActionNotificationsEqual(gitRemoteActionSnapshot, next)) {
    gitRemoteActionSnapshot = next;
  }
}

export function getGitRemoteActionNotificationsSnapshot(): GitRemoteActionNotification[] {
  return gitRemoteActionSnapshot;
}

export function publishAppNotifications(notifications: AppNotification[]) {
  saveAppNotifications(notifications);
  syncDiagramReadySnapshot(notifications);
  syncGitRemoteActionSnapshot(notifications);
  dispatchSessionNotificationsChanged(notifications);
}

export function subscribeAppNotifications(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onChanged = () => {
    syncDiagramReadySnapshot();
    syncGitRemoteActionSnapshot();
    onStoreChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === NOTIFICATIONS_KEY) onChanged();
  };
  window.addEventListener(SESSION_NOTIFICATIONS_CHANGED_EVENT, onChanged);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.removeEventListener("storage", onStorage);
  };
}

export function getDiagramReadyNotificationsSnapshot(): DiagramReadyNotification[] {
  syncDiagramReadySnapshot();
  return diagramReadySnapshot;
}

/** @deprecated Use saveAppNotifications */
export function saveSessionFinishNotifications(
  notifications: SessionFinishNotification[],
) {
  const others = loadAppNotifications().filter((n) => n.kind !== "session-finished");
  saveAppNotifications(sortNotifications([...others, ...notifications]));
}

export function clearAppNotifications() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NOTIFICATIONS_KEY);
    syncDiagramReadySnapshot([]);
    dispatchSessionNotificationsChanged([]);
  } catch {
    /* quota or privacy-mode storage */
  }
}

/** @deprecated Use clearAppNotifications */
export function clearSessionFinishNotifications() {
  clearAppNotifications();
}

export function mergeSessionFinishNotification(
  current: AppNotification[],
  next: SessionFinishNotification,
): AppNotification[] {
  return sortNotifications([
    next,
    ...current.filter(
      (n) =>
        !(
          n.kind === "session-finished" &&
          n.id === next.id &&
          n.projectId === next.projectId
        ),
    ),
  ]);
}

export function mergeDiagramReadyNotification(
  current: AppNotification[],
  next: DiagramReadyNotification,
): AppNotification[] {
  return sortNotifications([
    next,
    ...current.filter(
      (n) =>
        !(
          n.kind === "diagram-ready" &&
          n.diagramId === next.diagramId &&
          n.projectId === next.projectId
        ),
    ),
  ]);
}

// Git entries share the global 200-entry budget with sessions and diagrams, so
// they get their own cap — clicking Fetch repeatedly can't evict session rows.
const MAX_GIT_REMOTE_ACTION_NOTIFICATIONS = 20;

export function mergeGitRemoteActionNotification(
  current: AppNotification[],
  next: GitRemoteActionNotification,
): AppNotification[] {
  const others = current.filter(
    (n) => !(n.kind === "git-remote-action" && n.id === next.id),
  );
  const git = [
    next,
    ...others.filter(
      (n): n is GitRemoteActionNotification => n.kind === "git-remote-action",
    ),
  ]
    .sort((a, b) => notificationTimestamp(b) - notificationTimestamp(a))
    .slice(0, MAX_GIT_REMOTE_ACTION_NOTIFICATIONS);
  return sortNotifications([
    ...git,
    ...others.filter((n) => n.kind !== "git-remote-action"),
  ]);
}

/**
 * Append a git fetch/pull/push outcome and publish. The renderer calls this
 * directly — it is the store's only non-server-event producer.
 */
export function recordGitRemoteActionNotification(
  entry: Omit<GitRemoteActionNotification, "kind">,
): AppNotification[] {
  const next = mergeGitRemoteActionNotification(loadAppNotifications(), {
    kind: "git-remote-action",
    ...entry,
  });
  publishAppNotifications(next);
  return next;
}

function notificationMatchesPruneTarget(
  notification: AppNotification,
  target: SessionNotificationPruneTarget,
): boolean {
  if (target.type === "notification-id") {
    // diagram-ready rows are keyed by diagramId, not id.
    return notification.kind !== "diagram-ready" && notification.id === target.id;
  }
  if (target.type === "task") {
    // Git entries have no task behind them — a task going away must not clear
    // the record of a pull that failed while it was running.
    if (notification.kind === "git-remote-action") return false;
    const taskId =
      notification.kind === "session-finished"
        ? notification.id
        : notification.taskId;
    return (
      taskId === target.taskId &&
      (!target.projectId || notification.projectId === target.projectId)
    );
  }
  if (target.type === "diagram") {
    return (
      notification.kind === "diagram-ready" &&
      notification.diagramId === target.diagramId &&
      notification.projectId === target.projectId
    );
  }
  if (target.type === "project") {
    return notification.projectId === target.projectId;
  }
  return (
    notification.projectId === target.projectId &&
    notification.worktreeId === target.worktreeId
  );
}

export function pruneAppNotifications(
  current: AppNotification[],
  target: SessionNotificationPruneTarget,
): AppNotification[] {
  const next = current.filter(
    (notification) => !notificationMatchesPruneTarget(notification, target),
  );
  return next.length === current.length ? current : next;
}

/** @deprecated Use pruneAppNotifications */
export function pruneSessionFinishNotifications(
  current: AppNotification[],
  target: SessionNotificationPruneTarget,
): AppNotification[] {
  return pruneAppNotifications(current, target);
}

function notificationPruneTarget(
  notification: AppNotification,
): SessionNotificationPruneTarget {
  if (notification.kind === "diagram-ready") {
    return {
      type: "diagram",
      diagramId: notification.diagramId,
      projectId: notification.projectId,
    };
  }
  if (notification.kind === "git-remote-action") {
    return { type: "notification-id", id: notification.id };
  }
  return {
    type: "task",
    taskId: notification.id,
    projectId: notification.projectId,
  };
}

export function pruneAppNotification(
  current: AppNotification[],
  notification: AppNotification,
): AppNotification[] {
  return pruneAppNotifications(current, notificationPruneTarget(notification));
}

/** @deprecated Use pruneAppNotification */
export function pruneSessionFinishNotification(
  current: AppNotification[],
  notification: SessionFinishNotification,
): AppNotification[] {
  return pruneAppNotification(current, notification);
}

function dispatchSessionNotificationsChanged(notifications: AppNotification[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SESSION_NOTIFICATIONS_CHANGED_EVENT, {
      detail: { notifications },
    }),
  );
}

export function pruneStoredAppNotifications(
  target: SessionNotificationPruneTarget,
): AppNotification[] {
  const current = loadAppNotifications();
  const next = pruneAppNotifications(current, target);
  if (next !== current) {
    publishAppNotifications(next);
  }
  return next;
}

/** @deprecated Use pruneStoredAppNotifications */
export function pruneStoredSessionFinishNotifications(
  target: SessionNotificationPruneTarget,
): AppNotification[] {
  return pruneStoredAppNotifications(target);
}

export function clearAppNotification(notification: AppNotification): AppNotification[] {
  const next = pruneAppNotification(loadAppNotifications(), notification);
  publishAppNotifications(next);
  return next;
}

export function pruneStoredAppNotification(
  notification: AppNotification,
): AppNotification[] {
  return pruneStoredAppNotifications(notificationPruneTarget(notification));
}

/** @deprecated Use pruneStoredAppNotification */
export function pruneStoredSessionFinishNotification(
  notification: SessionFinishNotification,
): AppNotification[] {
  return pruneStoredAppNotification(notification);
}

function pendingOpenStorageKey(kind: PendingNotificationOpen["kind"]) {
  return kind === "diagram-ready" ? PENDING_DIAGRAM_OPEN_KEY : PENDING_OPEN_KEY;
}

function writePendingOpen(request: PendingNotificationOpen) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      pendingOpenStorageKey(request.kind),
      JSON.stringify(request),
    );
  } catch {
    /* quota or privacy-mode storage */
  }
}

function dispatchPendingOpen(request: PendingNotificationOpen) {
  const eventName =
    request.kind === "diagram-ready"
      ? DIAGRAM_NOTIFICATION_OPEN_EVENT
      : SESSION_NOTIFICATION_OPEN_EVENT;
  window.dispatchEvent(
    new CustomEvent<PendingNotificationOpen>(eventName, {
      detail: request,
    }),
  );
}

export function requestSessionNotificationOpen(
  notification: SessionFinishNotification,
) {
  if (typeof window === "undefined") return;
  const request: PendingNotificationOpen = {
    kind: "session-finished",
    projectId: notification.projectId,
    worktreeId: notification.worktreeId,
    scopeId: notification.scopeId,
    taskId: notification.id,
    requestedAt: Date.now(),
  };
  writePendingOpen(request);
  dispatchPendingOpen(request);
  pruneStoredAppNotification(notification);
}

/**
 * Enqueue a request to open + focus a session by id, without needing a full
 * notification object. Reuses the same pending-open pipeline the notification
 * "Open" button uses, so `openRequestedSession` (in routes/projects.$id.tsx)
 * switches worktree/scope if needed, materializes the session, and focuses its
 * grid cell. Callers should `router.navigate` to the project first. Used by the
 * prompt-search palette.
 */
export function requestSessionOpenById(target: {
  projectId: string;
  worktreeId: string | null;
  scopeId: string;
  taskId: string;
}) {
  if (typeof window === "undefined") return;
  const request: PendingNotificationOpen = {
    kind: "session-finished",
    projectId: target.projectId,
    worktreeId: target.worktreeId,
    scopeId: target.scopeId,
    taskId: target.taskId,
    requestedAt: Date.now(),
  };
  writePendingOpen(request);
  dispatchPendingOpen(request);
}

export function requestDiagramNotificationOpen(
  notification: DiagramReadyNotification,
) {
  if (typeof window === "undefined") return;
  const request: PendingNotificationOpen = {
    kind: "diagram-ready",
    projectId: notification.projectId,
    worktreeId: notification.worktreeId,
    scopeId: notification.scopeId,
    taskId: notification.taskId,
    diagramId: notification.diagramId,
    requestedAt: Date.now(),
  };
  writePendingOpen(request);
  dispatchPendingOpen(request);
  pruneStoredAppNotification(notification);
}

function readPendingOpenFromKey(
  key: string,
  kind: PendingNotificationOpen["kind"],
): PendingNotificationOpen | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const request = toPendingOpen(JSON.parse(raw));
    if (!request || request.kind !== kind) return null;
    if (Date.now() - request.requestedAt > PENDING_OPEN_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return request;
  } catch {
    return null;
  }
}

export function readPendingSessionOpen(
  projectId: string,
): PendingNotificationOpen | null {
  const request = readPendingOpenFromKey(PENDING_OPEN_KEY, "session-finished");
  if (!request) return null;
  return request.projectId === projectId ? request : null;
}

export function readPendingDiagramOpen(): PendingNotificationOpen | null {
  return readPendingOpenFromKey(PENDING_DIAGRAM_OPEN_KEY, "diagram-ready");
}

export function clearPendingNotificationOpen(request: PendingNotificationOpen) {
  if (typeof window === "undefined") return;
  try {
    const key = pendingOpenStorageKey(request.kind);
    const raw = window.localStorage.getItem(key);
    const current = raw ? toPendingOpen(JSON.parse(raw)) : null;
    if (
      current &&
      current.kind === request.kind &&
      current.projectId === request.projectId &&
      current.taskId === request.taskId &&
      current.scopeId === request.scopeId &&
      current.requestedAt === request.requestedAt &&
      current.diagramId === request.diagramId
    ) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore malformed storage */
  }
}

/** @deprecated Use clearPendingNotificationOpen */
export function clearPendingSessionOpen(request: PendingNotificationOpen) {
  clearPendingNotificationOpen(request);
}
