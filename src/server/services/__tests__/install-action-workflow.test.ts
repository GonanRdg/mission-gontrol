import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installActionWorkflow,
  readActionWorkflowAvailability,
} from "../install-action-workflow";

let root: string;
let home: string;
let project: string;
let bundled: string;

function writeSkill(dir: string, name: string, body = "# Skill\n"): string {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), body);
  return skillDir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-action-install-"));
  home = path.join(root, "home");
  project = path.join(root, "project");
  bundled = path.join(root, "bundled");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(bundled, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("action workflow availability", () => {
  it("accepts a project skill in the selected agent root", () => {
    const source = writeSkill(path.join(project, ".codex", "skills"), "implement-ticket");

    expect(
      readActionWorkflowAvailability("implement-ticket", "codex", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).toMatchObject({ status: "available", origin: "project", sourcePath: source, installMethod: null });
  });

  it("offers a symlink when another harness has the workflow", () => {
    const source = writeSkill(path.join(home, ".claude", "skills"), "implement-ticket");
    const target = path.join(home, ".codex", "skills", "implement-ticket");

    expect(
      readActionWorkflowAvailability("implement-ticket", "codex", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).toEqual({
      agent: "codex",
      status: "installable",
      origin: "global",
      sourcePath: source,
      targetPath: target,
      installMethod: "symlink",
    });
  });

  it("offers a copy from the bundled tree when found nowhere else", () => {
    const source = writeSkill(bundled, "implement-ticket");

    expect(
      readActionWorkflowAvailability("implement-ticket", "claude-code", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).toMatchObject({ status: "installable", origin: "bundled", sourcePath: source, installMethod: "copy" });
  });

  it("marks missing unbundled workflows unavailable", () => {
    expect(
      readActionWorkflowAvailability("missing-skill", "opencode", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).toMatchObject({
      status: "unavailable",
      origin: null,
      sourcePath: null,
      targetPath: path.join(home, ".config", "opencode", "skills", "missing-skill"),
    });
  });

  it("rejects workflow names that could escape a skill root", () => {
    expect(() =>
      readActionWorkflowAvailability("../outside", "codex", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).toThrow("invalid workflow skill name");
  });

  it("recognises compatibility roots for Cursor and OpenCode", () => {
    const source = writeSkill(path.join(home, ".claude", "skills"), "research");
    const opts = { projectPath: project, homeDir: home, bundledRoots: [bundled] };

    expect(readActionWorkflowAvailability("research", "cursor-cli", opts)).toMatchObject({
      status: "available",
      sourcePath: source,
    });
    expect(readActionWorkflowAvailability("research", "opencode", opts)).toMatchObject({
      status: "available",
      sourcePath: source,
    });
  });
});

describe("installActionWorkflow", () => {
  it("symlinks another harness copy into the selected agent root", async () => {
    const source = writeSkill(path.join(home, ".claude", "skills"), "implement-ticket");
    const result = await installActionWorkflow("implement-ticket", "codex", {
      projectPath: project,
      homeDir: home,
      bundledRoots: [bundled],
    });

    expect(result.status).toBe("available");
    expect(fs.realpathSync(result.targetPath)).toBe(fs.realpathSync(source));
  });

  it("copies a bundled workflow tree into the selected agent root", async () => {
    writeSkill(bundled, "investigate-issue", "# Investigate\n");
    const result = await installActionWorkflow("investigate-issue", "claude-code", {
      projectPath: project,
      homeDir: home,
      bundledRoots: [bundled],
    });

    expect(result.status).toBe("available");
    expect(fs.readFileSync(path.join(result.targetPath, "SKILL.md"), "utf8")).toBe("# Investigate\n");
    expect(fs.lstatSync(result.targetPath).isSymbolicLink()).toBe(false);
  });

  it("falls back to copying when symlink creation is unavailable", async () => {
    writeSkill(path.join(home, ".claude", "skills"), "code-review", "# Review\n");
    const result = await installActionWorkflow("code-review", "codex", {
      projectPath: project,
      homeDir: home,
      bundledRoots: [bundled],
      createSymlink: async () => {
        const error = new Error("not permitted") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      },
    });

    expect(result.status).toBe("available");
    expect(fs.lstatSync(result.targetPath).isSymbolicLink()).toBe(false);
  });

  it("does not replace an existing incomplete destination", async () => {
    writeSkill(path.join(home, ".claude", "skills"), "implement-ticket");
    const target = path.join(home, ".codex", "skills", "implement-ticket");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "notes.txt"), "keep\n");

    await expect(
      installActionWorkflow("implement-ticket", "codex", {
        projectPath: project,
        homeDir: home,
        bundledRoots: [bundled],
      }),
    ).rejects.toThrow("destination already exists");
    expect(fs.readFileSync(path.join(target, "notes.txt"), "utf8")).toBe("keep\n");
  });
});
