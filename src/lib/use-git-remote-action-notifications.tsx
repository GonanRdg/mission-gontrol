import { useSyncExternalStore } from "react";
import {
  getGitRemoteActionNotificationsSnapshot,
  subscribeAppNotifications,
  type GitRemoteActionNotification,
} from "~/lib/session-notification-store";

// Stable reference so getServerSnapshot returns the same value every call —
// returning a fresh `[]` makes useSyncExternalStore loop (see React's
// "getServerSnapshot should be cached" warning).
const EMPTY_SERVER_SNAPSHOT: GitRemoteActionNotification[] = [];
const getServerSnapshot = (): GitRemoteActionNotification[] => EMPTY_SERVER_SNAPSHOT;

export function useGitRemoteActionNotificationList(): GitRemoteActionNotification[] {
  return useSyncExternalStore(
    subscribeAppNotifications,
    getGitRemoteActionNotificationsSnapshot,
    getServerSnapshot,
  );
}
