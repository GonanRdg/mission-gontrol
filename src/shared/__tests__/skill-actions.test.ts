import { describe, expect, it } from "vitest";
import { parseSkillAction } from "../skill-actions";

function skill(frontmatter: string, body = "\n# Body\n"): string {
  return `---\n${frontmatter}\n---${body}`;
}

const MINIMAL = `name: fix-a-bug
description: Fix a bug.
mc-action:
  title: Fix a bug
  skill: investigate-issue
  sources:
    - { id: jira, label: Jira ticket, widget: url }
  prompt: |
    /investigate-issue {{sources.jira}}`;

describe("parseSkillAction", () => {
  it("returns null for a document with no frontmatter", () => {
    expect(parseSkillAction("# Just a heading\n", "whatever")).toBeNull();
  });

  it("returns null for a skill without an mc-action block", () => {
    expect(parseSkillAction(skill("name: tdd\ndescription: Test first."), "tdd")).toBeNull();
  });

  it("returns null when the frontmatter fence is never closed", () => {
    expect(parseSkillAction("---\nname: broken\nmc-action:\n", "broken")).toBeNull();
  });

  it("parses a minimal block and takes the name from the frontmatter", () => {
    const parsed = parseSkillAction(skill(MINIMAL), "dir-name");
    expect(parsed?.ok).toBe(true);
    if (!parsed?.ok) return;
    expect(parsed.name).toBe("fix-a-bug");
    expect(parsed.action.title).toBe("Fix a bug");
    expect(parsed.action.skill).toBe("investigate-issue");
    expect(parsed.action.sources).toHaveLength(1);
  });

  it("falls back to the directory name when the skill declares none", () => {
    const withoutName = MINIMAL.split("\n").filter((l) => !l.startsWith("name:")).join("\n");
    const parsed = parseSkillAction(skill(withoutName), "dir-name");
    expect(parsed?.name).toBe("dir-name");
  });

  it("defaults worktree to true so forgetting the key isolates the run", () => {
    const parsed = parseSkillAction(skill(MINIMAL), "fix-a-bug");
    expect(parsed?.ok && parsed.action.worktree).toBe(true);
  });

  it("honours an explicit worktree: false", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("  skill:", "  worktree: false\n  skill:")), "x");
    expect(parsed?.ok && parsed.action.worktree).toBe(false);
  });

  it("defaults sourcesMin, inputs and options", () => {
    const parsed = parseSkillAction(skill(MINIMAL), "fix-a-bug");
    expect(parsed?.ok).toBe(true);
    if (!parsed?.ok) return;
    expect(parsed.action.sourcesMin).toBe(0);
    expect(parsed.action.inputs).toEqual([]);
    expect(parsed.action.options).toEqual([]);
  });

  it("applies the option default", () => {
    const withOption = MINIMAL.replace(
      "  prompt:",
      "  options:\n    - { id: plan, label: Create execution plan, default: true }\n    - { id: pr, label: Open PR }\n  prompt:",
    );
    const parsed = parseSkillAction(skill(withOption), "x");
    expect(parsed?.ok).toBe(true);
    if (!parsed?.ok) return;
    expect(parsed.action.options.map((o) => o.default)).toEqual([true, false]);
  });

  it("rejects a widget outside the vocabulary", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("widget: url", "widget: colorpicker")), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("sources.0.widget");
  });

  it("rejects an unknown top-level key instead of ignoring the typo", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("  title:", "  titel: Typo\n  title:")), "x");
    expect(parsed?.ok).toBe(false);
  });

  it("rejects a missing prompt", () => {
    const noPrompt = MINIMAL.split("\n").slice(0, -2).join("\n");
    const parsed = parseSkillAction(skill(noPrompt), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("prompt");
  });

  it("rejects duplicate source ids", () => {
    const dupe = MINIMAL.replace(
      "    - { id: jira, label: Jira ticket, widget: url }",
      "    - { id: jira, label: Jira ticket, widget: url }\n    - { id: jira, label: Again, widget: url }",
    );
    const parsed = parseSkillAction(skill(dupe), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain('duplicate source id "jira"');
  });

  it("rejects sourcesMin larger than the declared source types", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("  prompt:", "  sourcesMin: 3\n  prompt:")), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("sourcesMin");
  });

  it("rejects a select without choices", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("widget: url", "widget: select")), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("choices");
  });

  it("rejects an agent outside the registry", () => {
    const parsed = parseSkillAction(skill(MINIMAL.replace("  skill:", "  agents: [gpt-cli]\n  skill:")), "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("agents");
  });

  it("surfaces invalid YAML as a broken action when the block is mentioned", () => {
    const parsed = parseSkillAction("---\nname: x\nmc-action:\n  title: [unclosed\n---\n", "x");
    expect(parsed?.ok).toBe(false);
    if (parsed?.ok !== false) return;
    expect(parsed.error).toContain("invalid YAML frontmatter");
  });

  it("stays silent about invalid YAML in a skill that is not an action", () => {
    expect(parseSkillAction("---\nname: x\ndescription: [unclosed\n---\n", "x")).toBeNull();
  });
});
