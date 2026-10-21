export type BranchPullRequest = {
  number: number;
  url: string;
  title: string;
  isDraft: boolean;
};

export type BranchPullRequestResult = {
  branch: string | null;
  pullRequest: BranchPullRequest | null;
};

export type RepositoryPullRequest = BranchPullRequest & { headRefName: string };
export type RepositoryPullRequestsResult = {
  repository: string | null;
  pullRequests: RepositoryPullRequest[];
};

export function isRepositoryPullRequest(value: unknown): value is RepositoryPullRequest {
  if (!value || typeof value !== "object") return false;
  const pr = value as RepositoryPullRequest;
  return Number.isInteger(pr.number) && pr.number > 0 && typeof pr.url === "string" &&
    isPullRequestUrl(pr.url) && typeof pr.title === "string" && typeof pr.isDraft === "boolean" &&
    typeof pr.headRefName === "string" && pr.headRefName.length > 0;
}

export type PrBrowserBounds = { x: number; y: number; width: number; height: number };
export type PrBrowserState = {
  sessionId: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
};
export type PrBrowserCommand = "back" | "forward" | "reload" | "external" | "focus";
export type PrBrowserIntent = { sessionId: string; action: "hide" | "restore" | "expand" | "focus" };

export const PR_BROWSER_PARTITION = "persist:pr-browser";

export function isPullRequestUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "github.com" &&
      !url.port && !url.username && !url.password &&
      /^\/[^/]+\/[^/]+\/pull\/[1-9]\d*(?:\/.*)?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isBrowserNavigationUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validPrBrowserBounds(value: unknown): value is PrBrowserBounds {
  if (!value || typeof value !== "object") return false;
  const bounds = value as PrBrowserBounds;
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.x >= 0 && bounds.y >= 0 && bounds.width >= 1 && bounds.height >= 1 &&
    bounds.width <= 20_000 && bounds.height <= 20_000;
}
