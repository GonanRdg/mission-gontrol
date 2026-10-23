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

export type RepositoryPullRequest = BranchPullRequest & {
  headRefName: string;
  headRepositoryUrl?: string | null;
};
export type RepositoryPullRequestsResult = {
  repository: string | null;
  pullRequests: RepositoryPullRequest[];
};

export function isRepositoryPullRequest(value: unknown): value is RepositoryPullRequest {
  if (!value || typeof value !== "object") return false;
  const pr = value as RepositoryPullRequest;
  return Number.isInteger(pr.number) && pr.number > 0 && typeof pr.url === "string" &&
    isPullRequestUrl(pr.url) && typeof pr.title === "string" && typeof pr.isDraft === "boolean" &&
    typeof pr.headRefName === "string" && pr.headRefName.length > 0 &&
    (pr.headRepositoryUrl == null || (typeof pr.headRepositoryUrl === "string" && githubRepositoryKey(pr.headRepositoryUrl) !== null));
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

export function isRepositoryPullRequestUrl(raw: string, repository: string): boolean {
  if (!isPullRequestUrl(raw)) return false;
  const pr = new URL(raw);
  return isSameGithubRepository(`${pr.origin}/${pr.pathname.split("/").slice(1, 3).join("/")}`, repository);
}

function githubRepositoryKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password ||
        !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) return null;
    return url.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isSameGithubRepository(first: string, second: string): boolean {
  const key = githubRepositoryKey(first);
  return key !== null && key === githubRepositoryKey(second);
}

export function isCurrentBranchPullRequest(pr: RepositoryPullRequest, repository: string | null | undefined, branch: string | null): boolean {
  return branch !== null && pr.headRefName === branch && !!pr.headRepositoryUrl && !!repository &&
    isSameGithubRepository(pr.headRepositoryUrl, repository);
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
