import type { TaskAgent, TaskStatus } from "./domain";

export type ActiveSessionSummary = {
  taskId: string;
  projectId: string;
  projectName: string;
  worktreeId: string | null;
  scopeId: string;
  title: string;
  icon: string | null;
  action: string | null;
  agent: TaskAgent;
  status: TaskStatus;
  updatedAt: number;
};

export type ActiveSessionGroup = {
  projectId: string;
  projectName: string;
  sessions: ActiveSessionSummary[];
};

export type ActiveSessions = {
  live: ActiveSessionGroup[];
  recentlyFinished: ActiveSessionGroup[];
};
