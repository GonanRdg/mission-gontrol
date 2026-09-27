import { describe, expect, it } from "vitest";
import { isProjectActionsPath } from "../project-actions-route";

describe("isProjectActionsPath", () => {
  it.each([
    ["/projects/project-1/actions", true],
    ["/projects/project-1/actions/", true],
    ["/projects/project-1", false],
    ["/projects/project-1/actions/extra", false],
    ["/settings/actions", false],
  ])("matches only the project actions route: %s", (pathname, expected) => {
    expect(isProjectActionsPath(pathname)).toBe(expected);
  });
});
