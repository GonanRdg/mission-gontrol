import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { OPEN_SETTINGS_EVENT } from "./design-meta";

export const ticketKeys = {
  all: ["tickets"] as const,
  connection: ["tickets", "connection"] as const,
  filters: (id: string, provider?: string) => ["tickets", "filters", id, provider] as const,
  list: (id: string, provider?: string) => ["tickets", "list", id, provider] as const,
  detail: (id: string, provider: string, ticket: string, context?: string) => ["tickets", "detail", id, provider, ticket, ...(context ? [context] : [])] as const,
};
export function useTicketConnection() {
  return useQuery({ queryKey: ticketKeys.connection, queryFn: api.ticketConnection, staleTime: 30_000,
    refetchInterval: query => query.state.data?.connecting ? 2000 : false });
}
export function openTicketSettings(projectId?: string) {
  if (projectId) window.localStorage.setItem("mc-ticket-settings-project", projectId);
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { panel: "tickets" } }));
}
