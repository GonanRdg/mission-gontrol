import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SessionSwitcherPalette } from "~/components/views/SessionSwitcherPalette";
import { queryKeys, useActiveSessions } from "~/queries";
import type { ActiveSessions } from "~/shared/active-sessions";
import { useDebouncedCallback } from "./use-debounced-callback";
import { useServerEvents } from "./use-events";

type SessionSwitcherContextValue = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  sessions: ActiveSessions | undefined;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
};

const SessionSwitcherContext = createContext<SessionSwitcherContextValue | null>(null);

export function SessionSwitcherProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useActiveSessions();
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const retry = useCallback(() => void query.refetch(), [query.refetch]);
  const invalidateActiveSessions = useDebouncedCallback(
    () => void queryClient.invalidateQueries({ queryKey: queryKeys.activeSessions }),
    150,
    400,
  );

  const onServerEvent = useCallback(
    (event: { type: string }) => {
      if (!event.type.startsWith("task:")) return;
      invalidateActiveSessions();
    },
    [invalidateActiveSessions],
  );
  useServerEvents(onServerEvent);

  const value = useMemo<SessionSwitcherContextValue>(
    () => ({
      open,
      close,
      isOpen,
      sessions: query.data,
      isLoading: query.isLoading,
      isError: query.isError,
      retry,
    }),
    [close, isOpen, open, query.data, query.isError, query.isLoading, retry],
  );

  return (
    <SessionSwitcherContext.Provider value={value}>
      {children}
      <SessionSwitcherPalette />
    </SessionSwitcherContext.Provider>
  );
}

export function useSessionSwitcher(): SessionSwitcherContextValue {
  const context = useContext(SessionSwitcherContext);
  if (!context) throw new Error("useSessionSwitcher must be used within SessionSwitcherProvider");
  return context;
}
