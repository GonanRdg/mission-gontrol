export const ACTIONS_WINDOW_ENABLED = false;

export function isProjectActionsPath(pathname: string): boolean {
  return /^\/projects\/[^/]+\/actions\/?$/.test(pathname);
}
