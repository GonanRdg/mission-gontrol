export function isProjectActionsPath(pathname: string): boolean {
  return /^\/projects\/[^/]+\/actions\/?$/.test(pathname);
}
