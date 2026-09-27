import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSkillAction } from "../skill-actions";

const skillsRoot = path.join(process.cwd(), ".agents", "skills");
const wrappers = [
  "action-implement-ticket",
  "action-investigate-issue",
  "action-review-code",
  "action-explore-idea",
] as const;

function readAction(dirName: (typeof wrappers)[number]) {
  const content = fs.readFileSync(path.join(skillsRoot, dirName, "SKILL.md"), "utf8");
  const parsed = parseSkillAction(content, dirName);
  expect(parsed?.ok).toBe(true);
  if (!parsed?.ok) throw new Error(`${dirName} did not parse`);
  return parsed.action;
}

describe("bundled actions", () => {
  it("ships four valid wrappers with their workflow skills", () => {
    const actions = wrappers.map(readAction);

    expect(actions.map((action) => action.skill)).toEqual([
      "implement-ticket",
      "investigate-issue",
      "code-review",
      "research",
    ]);
    for (const action of actions) {
      expect(fs.existsSync(path.join(skillsRoot, action.skill, "SKILL.md"))).toBe(true);
    }
    expect(fs.existsSync(path.join(skillsRoot, "implement-ticket", "REFERENCE.md"))).toBe(true);
    expect(fs.existsSync(path.join(skillsRoot, "investigate-issue", "REFERENCE.md"))).toBe(true);
  });

  it("covers implementation, investigation, ref review, and free-text research", () => {
    const implement = readAction("action-implement-ticket");
    const investigate = readAction("action-investigate-issue");
    const review = readAction("action-review-code");
    const explore = readAction("action-explore-idea");

    expect(implement.worktree).toBe(true);
    expect(implement.sources.some((source) => source.widget === "url")).toBe(true);
    expect(implement.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "jira", widget: "text" })]),
    );
    expect(implement.options).toEqual([]);
    expect(implement.prompt).toContain("Ask for explicit confirmation before changing tracker state.");
    expect(implement.prompt).toContain("Keep test and build results out of the PR description");
    expect(investigate.worktree).toBe(true);
    expect(investigate.sources.some((source) => source.id === "datadog")).toBe(true);
    expect(investigate.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "jira", widget: "text" })]),
    );
    expect(investigate.prompt).toContain("Ask for explicit confirmation before changing tracker state.");
    expect(investigate.prompt).toContain("Keep test and build results out of the PR description");
    expect(review.worktree).toBe(true);
    expect(review.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "base", widget: "text", required: true, placeholder: "main" }),
      ]),
    );
    expect(explore.worktree).toBe(false);
    expect(explore.sources).toEqual([
      expect.objectContaining({ id: "text", widget: "textarea" }),
    ]);
  });
});
