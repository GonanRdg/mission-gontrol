import { describe, expect, it } from "vitest";
import {
  clearSessionFinishNotifications,
  getGitRemoteActionNotificationsSnapshot,
  loadAppNotifications,
  loadSessionFinishNotifications,
  mergeGitRemoteActionNotification,
  mergeSessionFinishNotification,
  recordGitRemoteActionNotification,
  pruneSessionFinishNotifications,
  requestDiagramNotificationOpen,
  requestSessionNotificationOpen,
  saveAppNotifications,
  saveSessionFinishNotifications,
  type AppNotification,
  type DiagramReadyNotification,
  type GitRemoteActionNotification,
  type SessionFinishNotification,
} from "../session-notification-store";

const notifications: SessionFinishNotification[] = [
  {
    kind: "session-finished",
    id: "task-1",
    projectId: "project-1",
    worktreeId: null,
    scopeId: "local",
    projectName: "Core",
    taskTitle: "Answer name question",
    finishedAt: 3,
  },
  {
    kind: "session-finished",
    id: "task-2",
    projectId: "project-1",
    worktreeId: "worktree-1",
    scopeId: "sb-1",
    projectName: "Core",
    taskTitle: "Investigate router error",
    finishedAt: 2,
  },
  {
    kind: "session-finished",
    id: "task-1",
    projectId: "project-2",
    worktreeId: null,
    scopeId: "local",
    projectName: "Academy",
    taskTitle: "Generate title",
    finishedAt: 1,
  },
];

describe("pruneSessionFinishNotifications", () => {
  it("removes the notification for a deleted task in the matching project", () => {
    const next = pruneSessionFinishNotifications(notifications, {
      type: "task",
      taskId: "task-1",
      projectId: "project-1",
    });

    expect(next.map((n) => `${n.projectId}:${n.kind === "diagram-ready" ? n.taskId : n.id}`)).toEqual([
      "project-1:task-2",
      "project-2:task-1",
    ]);
  });

  it("removes task notifications by id when the project is unknown", () => {
    const next = pruneSessionFinishNotifications(notifications, {
      type: "task",
      taskId: "task-1",
    });

    expect(next.map((n) => `${n.projectId}:${n.kind === "diagram-ready" ? n.taskId : n.id}`)).toEqual([
      "project-1:task-2",
    ]);
  });

  it("removes every notification for a deleted project", () => {
    const next = pruneSessionFinishNotifications(notifications, {
      type: "project",
      projectId: "project-1",
    });

    expect(next.map((n) => `${n.projectId}:${n.kind === "diagram-ready" ? n.taskId : n.id}`)).toEqual([
      "project-2:task-1",
    ]);
  });

  it("removes notifications scoped to a deleted worktree", () => {
    const next = pruneSessionFinishNotifications(notifications, {
      type: "worktree",
      projectId: "project-1",
      worktreeId: "worktree-1",
    });

    expect(next.map((n) => `${n.projectId}:${n.kind === "diagram-ready" ? n.taskId : n.id}`)).toEqual([
      "project-1:task-1",
      "project-2:task-1",
    ]);
  });

  it("keeps the same array when nothing matches", () => {
    const next = pruneSessionFinishNotifications(notifications, {
      type: "task",
      taskId: "missing",
    });

    expect(next).toBe(notifications);
  });
});

describe("clearSessionFinishNotifications", () => {
  it("clears persisted notifications and emits the notification change event", () => {
    const store = new Map<string, string>();
    const dispatchedEvents: Event[] = [];
    const notification = notifications[0]!;
    const previousWindow = globalThis.window;

    globalThis.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: (event: Event) => {
        dispatchedEvents.push(event);
        return true;
      },
    } as unknown as Window & typeof globalThis;

    try {
      saveSessionFinishNotifications([notification]);
      expect(loadSessionFinishNotifications()).toEqual([notification]);

      clearSessionFinishNotifications();

      expect(loadSessionFinishNotifications()).toEqual([]);
      expect(dispatchedEvents).toHaveLength(1);
      expect(dispatchedEvents[0]?.type).toBe("mc:session-notifications-changed");
    } finally {
      globalThis.window = previousWindow;
    }
  });
});

describe("notification cap", () => {
  it("keeps only the 200 most-recent notifications, dropping the oldest", () => {
    // 205 notifications with ascending finishedAt (0 = oldest, 204 = newest).
    let current: AppNotification[] = [];
    for (let i = 0; i < 205; i += 1) {
      current = mergeSessionFinishNotification(current, {
        kind: "session-finished",
        id: `task-${i}`,
        projectId: "project-1",
        worktreeId: null,
        scopeId: "local",
        projectName: "Core",
        taskTitle: `Session ${i}`,
        finishedAt: i,
      });
    }

    expect(current).toHaveLength(200);
    // Newest-first, and the 5 oldest (finishedAt 0..4) are dropped.
    expect(current[0]?.kind === "session-finished" && current[0].id).toBe("task-204");
    const oldest = current[current.length - 1]!;
    expect(oldest.kind === "session-finished" && oldest.id).toBe("task-5");
    const ids = new Set(
      current.map((n) => (n.kind === "session-finished" ? n.id : "")),
    );
    expect(ids.has("task-0")).toBe(false);
    expect(ids.has("task-4")).toBe(false);
  });
});

describe("requestDiagramNotificationOpen", () => {
  it("clears the opened diagram notification and emits diagram open plus change events", () => {
    const store = new Map<string, string>();
    const dispatchedEvents: Event[] = [];
    const notification: DiagramReadyNotification = {
      kind: "diagram-ready",
      diagramId: "diagram-1",
      taskId: "task-1",
      projectId: "project-1",
      worktreeId: null,
      scopeId: "sb-1",
      projectName: "Core",
      taskTitle: "Build flow",
      diagramTitle: "Pipeline",
      createdAt: 1,
    };
    const previousWindow = globalThis.window;

    globalThis.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: (event: Event) => {
        dispatchedEvents.push(event);
        return true;
      },
    } as unknown as Window & typeof globalThis;

    try {
      saveAppNotifications([
        notifications[0]!,
        notification,
      ]);

      requestDiagramNotificationOpen(notification);

      expect(loadAppNotifications().map((n) =>
        n.kind === "diagram-ready"
          ? `diagram:${n.projectId}:${n.diagramId}`
          : `session:${n.projectId}:${n.id}`,
      )).toEqual(["session:project-1:task-1"]);
      expect(dispatchedEvents.map((event) => event.type)).toEqual([
        "mc:diagram-notification-open",
        "mc:session-notifications-changed",
      ]);
      expect((dispatchedEvents[0] as CustomEvent).detail).toMatchObject({
        kind: "diagram-ready",
        projectId: "project-1",
        taskId: "task-1",
        diagramId: "diagram-1",
        scopeId: "sb-1",
      });
    } finally {
      globalThis.window = previousWindow;
    }
  });
});

describe("requestSessionNotificationOpen", () => {
  it("clears the opened notification and emits open plus change events", () => {
    const store = new Map<string, string>();
    const dispatchedEvents: Event[] = [];
    const notification = notifications[0]!;
    const previousWindow = globalThis.window;

    globalThis.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: (event: Event) => {
        dispatchedEvents.push(event);
        return true;
      },
    } as unknown as Window & typeof globalThis;

    try {
      saveSessionFinishNotifications(notifications);

      requestSessionNotificationOpen(notification);

      expect(loadSessionFinishNotifications().map((n) => `${n.projectId}:${n.id}`))
        .toEqual(["project-1:task-2", "project-2:task-1"]);
      expect(dispatchedEvents.map((event) => event.type)).toEqual([
        "mc:session-notification-open",
        "mc:session-notifications-changed",
      ]);
      expect((dispatchedEvents[0] as CustomEvent).detail).toMatchObject({
        kind: "session-finished",
        projectId: "project-1",
        taskId: "task-1",
        scopeId: "local",
      });
    } finally {
      globalThis.window = previousWindow;
    }
  });
});

describe("scopeId persistence", () => {
  it("defaults missing scopeId to local when loading legacy notifications", () => {
    const store = new Map<string, string>();
    const previousWindow = globalThis.window;

    globalThis.window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
      dispatchEvent: () => true,
    } as unknown as Window & typeof globalThis;

    try {
      store.set(
        "mc:sessionFinishNotifications",
        JSON.stringify([
          {
            kind: "session-finished",
            id: "task-legacy",
            projectId: "project-1",
            worktreeId: null,
            projectName: "Core",
            taskTitle: "Legacy session",
            finishedAt: 1,
          },
        ]),
      );

      expect(loadSessionFinishNotifications()[0]?.scopeId).toBe("local");
    } finally {
      globalThis.window = previousWindow;
    }
  });
});

function withMockWindow<T>(seed: string | null, run: () => T): T {
  const store = new Map<string, string>();
  if (seed !== null) store.set("mc:sessionFinishNotifications", seed);
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis;
  try {
    return run();
  } finally {
    globalThis.window = previousWindow;
  }
}

function gitEntry(
  overrides: Partial<GitRemoteActionNotification> = {},
): GitRemoteActionNotification {
  return {
    kind: "git-remote-action",
    id: "git-1",
    projectId: "project-1",
    worktreeId: null,
    scopeId: "local",
    projectName: "Core",
    action: "pull",
    tone: "error",
    title: "Pull failed",
    detail: "Branch has diverged\n\nfatal: Not possible to fast-forward",
    createdAt: 10,
    ...overrides,
  };
}

describe("git-remote-action notifications", () => {
  it("survives a save/load round trip instead of being coerced to a session", () => {
    const loaded = withMockWindow(JSON.stringify([gitEntry()]), () =>
      loadAppNotifications(),
    );

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      kind: "git-remote-action",
      action: "pull",
      tone: "error",
      title: "Pull failed",
    });
  });

  it("drops stored rows that are missing an action or title", () => {
    const loaded = withMockWindow(
      JSON.stringify([
        { ...gitEntry(), action: "rebase" },
        { ...gitEntry(), id: "git-2", title: "" },
      ]),
      () => loadAppNotifications(),
    );

    expect(loaded).toEqual([]);
  });

  it("dedupes by id and keeps only the newest 20 git entries", () => {
    let current: AppNotification[] = [];
    for (let i = 0; i < 25; i += 1) {
      current = mergeGitRemoteActionNotification(
        current,
        gitEntry({ id: `git-${i}`, createdAt: i }),
      );
    }
    current = mergeGitRemoteActionNotification(
      current,
      gitEntry({ id: "git-24", createdAt: 99, title: "Pulled main" }),
    );

    const git = current.filter((n) => n.kind === "git-remote-action");
    expect(git).toHaveLength(20);
    expect(git.filter((n) => n.id === "git-24")).toHaveLength(1);
    expect(git[0]).toMatchObject({ id: "git-24", title: "Pulled main" });
    expect(git.some((n) => n.id === "git-0")).toBe(false);
  });

  it("does not let git entries evict session entries", () => {
    let current: AppNotification[] = [...notifications];
    for (let i = 0; i < 30; i += 1) {
      current = mergeGitRemoteActionNotification(
        current,
        gitEntry({ id: `git-${i}`, createdAt: 100 + i }),
      );
    }

    expect(current.filter((n) => n.kind === "session-finished")).toHaveLength(3);
  });

  it("is cleared with its project but not by an unrelated task deletion", () => {
    const current: AppNotification[] = [...notifications, gitEntry()];

    expect(
      pruneSessionFinishNotifications(current, { type: "task", taskId: "task-1" }).some(
        (n) => n.kind === "git-remote-action",
      ),
    ).toBe(true);
    expect(
      pruneSessionFinishNotifications(current, {
        type: "project",
        projectId: "project-1",
      }).some((n) => n.kind === "git-remote-action"),
    ).toBe(false);
  });

  it("is cleared on its own by notification id", () => {
    const current: AppNotification[] = [gitEntry(), gitEntry({ id: "git-2" })];

    const next = pruneSessionFinishNotifications(current, {
      type: "notification-id",
      id: "git-1",
    });

    expect(next.map((n) => n.kind === "git-remote-action" && n.id)).toEqual(["git-2"]);
  });

  it("stays out of the session-only list", () => {
    const loaded = withMockWindow(
      JSON.stringify([gitEntry(), notifications[0]]),
      () => loadSessionFinishNotifications(),
    );

    expect(loaded.map((n) => n.id)).toEqual(["task-1"]);
  });

  it("records an entry and exposes it through the snapshot", () => {
    const snapshot = withMockWindow(null, () => {
      recordGitRemoteActionNotification({
        id: "git-live",
        projectId: "project-1",
        worktreeId: null,
        scopeId: "local",
        projectName: "Core",
        action: "push",
        tone: "success",
        title: "Pushed main",
        detail: "main -> main",
        createdAt: 42,
      });
      return getGitRemoteActionNotificationsSnapshot();
    });

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ id: "git-live", action: "push", tone: "success" });
  });
});
