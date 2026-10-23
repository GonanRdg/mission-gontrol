import { describe, expect, it } from "vitest";
import { isBrowserNavigationUrl, isCurrentBranchPullRequest, isPullRequestUrl, isRepositoryPullRequestUrl, validPrBrowserBounds } from "../pr-browser";

describe("PR browser input boundaries", () => {
  it("marks a PR as current only when its source repository and branch both match", () => {
    const pr = { number: 42, url: "https://github.com/owner/repo/pull/42", title: "Change", isDraft: false,
      headRefName: "feature", headRepositoryUrl: "https://github.com/Owner/REPO" };
    expect(isCurrentBranchPullRequest(pr, "https://github.com/owner/repo", "feature")).toBe(true);
    expect(isCurrentBranchPullRequest({ ...pr, headRepositoryUrl: "https://github.com/fork/repo" }, "https://github.com/owner/repo", "feature")).toBe(false);
    expect(isCurrentBranchPullRequest(pr, "https://github.com/owner/repo", "Feature")).toBe(false);
    expect(isCurrentBranchPullRequest(pr, null, "feature")).toBe(false);
    expect(isCurrentBranchPullRequest(pr, "https://github.com/owner/repo", null)).toBe(false);
  });
  it("matches GitHub repository names without case sensitivity", () => {
    expect(isRepositoryPullRequestUrl("https://github.com/owner/repo/pull/42", "https://github.com/Owner/REPO")).toBe(true);
    expect(isRepositoryPullRequestUrl("https://github.com/owner/repo/pull/42", "https://github.com/owner/repo/")).toBe(true);
  });
  it.each(["https://github.com/other/repo", "https://github.com/owner/repo-extra", "https://github.com.evil.test/owner/repo", "invalid"])(
    "rejects a PR from a different or invalid repository: %s", (repository) => {
      expect(isRepositoryPullRequestUrl("https://github.com/owner/repo/pull/42", repository)).toBe(false);
    },
  );
  it("accepts GitHub PR pages and anchors", () => {
    expect(isPullRequestUrl("https://github.com/owner/repo/pull/42/files#diff-example")).toBe(true);
  });
  it.each([
    "https://github.com.evil.test/owner/repo/pull/42", "http://github.com/owner/repo/pull/42",
    "https://user:password@github.com/owner/repo/pull/42", "file:///owner/repo/pull/42",
    "https://github.com/owner/repo/compare/main...branch", "https://github.com/owner/repo/pull/0",
  ])("rejects a non-PR or unsafe initial URL: %s", (url) => expect(isPullRequestUrl(url)).toBe(false));
  it("allows HTTPS identity-provider navigation", () => {
    expect(isBrowserNavigationUrl("https://login.example.test/sso")).toBe(true);
  });
  it.each(["javascript:alert(1)", "file:///etc/passwd", "http://example.test", "https://user:secret@example.test"])(
    "blocks unsafe browser navigation: %s", (url) => expect(isBrowserNavigationUrl(url)).toBe(false),
  );
  it("rejects malformed and unbounded native-view geometry", () => {
    expect(validPrBrowserBounds({ x: 20, y: 40, width: 600, height: 400 })).toBe(true);
    expect(validPrBrowserBounds({ x: -1, y: 0, width: 600, height: 400 })).toBe(false);
    expect(validPrBrowserBounds({ x: 0, y: 0, width: NaN, height: 400 })).toBe(false);
    expect(validPrBrowserBounds({ x: 0, y: 0, width: 40_000, height: 400 })).toBe(false);
  });
});
