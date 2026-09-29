import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverActions } from "../skill-discovery";

let home: string;
let project: string;
let bundled: string;

function writeSkill(root: string, dirName: string, frontmatter: string): void {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n# ${dirName}\n`);
}

function action(name: string, title: string, extra = ""): string {
  return `name: ${name}
description: ${title}.
mc-action:
  title: ${title}
  skill: implement-ticket${extra}
  sources:
    - { id: jira, label: Jira ticket, widget: url }
  prompt: |
    /implement-ticket {{sources.jira}}`;
}

const userClaude = () => path.join(home, ".claude", "skills");
const userCodex = () => path.join(home, ".codex", "skills");
const projectClaude = () => path.join(project, ".claude", "skills");
const projectCodex = () => path.join(project, ".codex", "skills");

function discover() {
  return discoverActions({ projectPath: project, homeDir: home, bundledRoots: [bundled] });
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "mc-actions-home-"));
  project = fs.mkdtempSync(path.join(os.tmpdir(), "mc-actions-proj-"));
  bundled = fs.mkdtempSync(path.join(os.tmpdir(), "mc-actions-bundled-"));
});

describe("discoverActions", () => {
  it("returns nothing when no root holds an action", () => {
    expect(discover()).toEqual([]);
  });

  it("finds actions in every tier and sorts them by name", () => {
    writeSkill(userClaude(), "zeta", action("zeta", "Zeta"));
    writeSkill(projectClaude(), "alpha", action("alpha", "Alpha"));
    writeSkill(bundled, "mid", action("mid", "Mid"));
    expect(discover().map((a) => a.name)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("ignores a skill with no mc-action block", () => {
    writeSkill(userClaude(), "tdd", "name: tdd\ndescription: Test first.");
    expect(discover()).toEqual([]);
  });

  it("ignores a directory without a SKILL.md", () => {
    fs.mkdirSync(path.join(userClaude(), "empty"), { recursive: true });
    expect(discover()).toEqual([]);
  });

  it("lets a project skill shadow the same name in the user root", () => {
    writeSkill(userClaude(), "implement", action("implement", "Global"));
    writeSkill(projectClaude(), "implement", action("implement", "Project"));
    const [found, ...rest] = discover();
    expect(rest).toEqual([]);
    expect(found?.origin.kind).toBe("project-claude");
    expect(found?.ok && found.action.title).toBe("Project");
  });

  it("prefers the Claude root over the Codex root at the same tier", () => {
    writeSkill(userCodex(), "implement", action("implement", "Codex"));
    writeSkill(userClaude(), "implement", action("implement", "Claude"));
    const [found] = discover();
    expect(found?.origin.kind).toBe("user-claude");
    expect(found?.ok && found.action.title).toBe("Claude");
  });

  it("prefers a project Codex skill over a user Claude one", () => {
    writeSkill(userClaude(), "implement", action("implement", "User"));
    writeSkill(projectCodex(), "implement", action("implement", "Project"));
    expect(discover()[0]?.origin.kind).toBe("project-codex");
  });

  it("treats bundled as the lowest tier", () => {
    writeSkill(bundled, "implement", action("implement", "Bundled"));
    writeSkill(userCodex(), "implement", action("implement", "User"));
    expect(discover()[0]?.origin.kind).toBe("user-codex");
  });

  it("dedupes on the declared name, not the directory name", () => {
    writeSkill(userClaude(), "implement-feature", action("implement", "Global"));
    writeSkill(projectClaude(), "other-dir", action("implement", "Project"));
    const found = discover();
    expect(found).toHaveLength(1);
    expect(found[0]?.origin.kind).toBe("project-claude");
  });

  it("skips dot-directories so Codex system skills stay out", () => {
    writeSkill(path.join(userCodex(), ".system"), "review-agent", action("review-agent", "System"));
    writeSkill(userCodex(), "implement", action("implement", "Real"));
    expect(discover().map((a) => a.name)).toEqual(["implement"]);
  });

  it("surfaces a malformed block as a broken entry instead of dropping it", () => {
    writeSkill(userClaude(), "broken", action("broken", "Broken").replace("widget: url", "widget: nope"));
    const [found] = discover();
    expect(found?.name).toBe("broken");
    expect(found?.ok).toBe(false);
    if (found?.ok !== false) return;
    expect(found.error).toContain("sources.0.widget");
  });

  it("lets a broken project skill shadow a valid global one of the same name", () => {
    writeSkill(userClaude(), "implement", action("implement", "Valid"));
    writeSkill(projectClaude(), "implement", action("implement", "Broken").replace("widget: url", "widget: nope"));
    const found = discover();
    expect(found).toHaveLength(1);
    expect(found[0]?.ok).toBe(false);
  });

  it("drops the project tier when no project is in scope", () => {
    writeSkill(projectClaude(), "implement", action("implement", "Project"));
    writeSkill(userClaude(), "implement", action("implement", "User"));
    const found = discoverActions({ homeDir: home, bundledRoots: [bundled] });
    expect(found[0]?.origin.kind).toBe("user-claude");
  });

  it("skips the bundled tier when the build has no bundled root", () => {
    writeSkill(bundled, "implement", action("implement", "Bundled"));
    expect(discoverActions({ homeDir: home, bundledRoots: null })).toEqual([]);
  });

  it("scans every bundled root, not just the first that exists", () => {
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "mc-actions-bundled2-"));
    writeSkill(bundled, "first", action("first", "First"));
    writeSkill(second, "second", action("second", "Second"));
    const found = discoverActions({ homeDir: home, bundledRoots: [bundled, second] });
    expect(found.map((a) => a.name)).toEqual(["first", "second"]);
  });

  it("resolves a name collision inside one root by directory order", () => {
    writeSkill(userClaude(), "b-dir", action("implement", "Second"));
    writeSkill(userClaude(), "a-dir", action("implement", "First"));
    const found = discover();
    expect(found).toHaveLength(1);
    expect(found[0]?.origin.dir.endsWith("a-dir")).toBe(true);
  });

  it("carries the worktree default through discovery", () => {
    writeSkill(userClaude(), "research", action("research", "Explore", "\n  worktree: false"));
    writeSkill(userClaude(), "implement", action("implement", "Implement"));
    const byName = Object.fromEntries(discover().map((a) => [a.name, a]));
    expect(byName.implement?.ok && byName.implement.action.worktree).toBe(true);
    expect(byName.research?.ok && byName.research.action.worktree).toBe(false);
  });
});
