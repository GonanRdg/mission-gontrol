import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ActionWorkflowAvailability } from "~/shared/skill-actions";
import { TASK_AGENTS, type TaskAgent } from "~/shared/domain";
import { bundledSkillsRoots } from "../bundled-skills-path";
import { assertSafeProjectRelativePath, copySkillTree } from "./_skills-install-helpers";

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type WorkflowRootsOptions = {
  projectPath: string;
  homeDir?: string;
  bundledRoots?: string[];
  createSymlink?: (source: string, target: string) => Promise<void>;
};

function globalTargetRoot(agent: TaskAgent, home: string): string {
  if (agent === "claude-code") return path.join(home, ".claude", "skills");
  if (agent === "codex") return path.join(home, ".codex", "skills");
  if (agent === "cursor-cli") return path.join(home, ".cursor", "skills");
  return path.join(home, ".config", "opencode", "skills");
}

function compatibleRoots(agent: TaskAgent, project: string, home: string): string[] {
  if (agent === "claude-code") {
    return [path.join(project, ".claude", "skills"), path.join(home, ".claude", "skills")];
  }
  if (agent === "codex") {
    return [path.join(project, ".codex", "skills"), path.join(home, ".codex", "skills")];
  }
  if (agent === "cursor-cli") {
    return [
      path.join(project, ".cursor", "skills"),
      path.join(project, ".agents", "skills"),
      path.join(project, ".claude", "skills"),
      path.join(project, ".codex", "skills"),
      path.join(home, ".cursor", "skills"),
      path.join(home, ".agents", "skills"),
      path.join(home, ".claude", "skills"),
      path.join(home, ".codex", "skills"),
    ];
  }
  return [
    path.join(project, ".opencode", "skills"),
    path.join(project, ".claude", "skills"),
    path.join(project, ".agents", "skills"),
    path.join(home, ".config", "opencode", "skills"),
    path.join(home, ".claude", "skills"),
    path.join(home, ".agents", "skills"),
  ];
}

function sourceRoots(project: string, home: string, bundled: string[]): string[] {
  return [
    path.join(project, ".claude", "skills"),
    path.join(project, ".codex", "skills"),
    path.join(project, ".agents", "skills"),
    path.join(project, ".cursor", "skills"),
    path.join(project, ".opencode", "skills"),
    path.join(home, ".claude", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".agents", "skills"),
    path.join(home, ".cursor", "skills"),
    path.join(home, ".config", "opencode", "skills"),
    ...bundled,
  ];
}

function hasSkill(dir: string): boolean {
  return fs.existsSync(path.join(dir, "SKILL.md"));
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => path.resolve(candidate)))];
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertSkillName(skillName: string): void {
  if (!SKILL_NAME_RE.test(skillName) || skillName.length > 64) {
    throw new Error("invalid workflow skill name");
  }
}

export function readActionWorkflowAvailability(
  skillName: string,
  agent: TaskAgent,
  opts: Omit<WorkflowRootsOptions, "createSymlink">,
): ActionWorkflowAvailability {
  assertSkillName(skillName);
  const project = path.resolve(opts.projectPath);
  const home = path.resolve(opts.homeDir ?? os.homedir());
  const bundled = unique(opts.bundledRoots ?? bundledSkillsRoots());
  const targetRoot = globalTargetRoot(agent, home);
  const targetPath = path.join(targetRoot, skillName);

  const installed = unique(compatibleRoots(agent, project, home))
    .map((root) => path.join(root, skillName))
    .find(hasSkill);
  if (installed) {
    return {
      agent,
      status: "available",
      origin: isWithin(project, installed) ? "project" : "global",
      sourcePath: installed,
      targetPath,
      installMethod: null,
    };
  }

  const source = unique(sourceRoots(project, home, bundled))
    .map((root) => path.join(root, skillName))
    .find(hasSkill) ?? null;
  const fromBundle = !!source && bundled.some((root) => path.dirname(source) === root);
  return {
    agent,
    status: source ? "installable" : "unavailable",
    origin: source ? (fromBundle ? "bundled" : isWithin(project, source) ? "project" : "global") : null,
    sourcePath: source,
    targetPath,
    installMethod: source ? (fromBundle ? "copy" : "symlink") : null,
  };
}

export function readActionWorkflowAvailabilities(
  skillName: string,
  opts: Omit<WorkflowRootsOptions, "createSymlink">,
): Record<TaskAgent, ActionWorkflowAvailability> {
  return Object.fromEntries(
    TASK_AGENTS.map((agent) => [agent, readActionWorkflowAvailability(skillName, agent, opts)]),
  ) as Record<TaskAgent, ActionWorkflowAvailability>;
}

function canCopyAfterSymlinkError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "EPERM" || code === "EACCES" || code === "ENOTSUP" || code === "EINVAL";
}

export async function installActionWorkflow(
  skillName: string,
  agent: TaskAgent,
  opts: WorkflowRootsOptions,
): Promise<ActionWorkflowAvailability> {
  const availability = readActionWorkflowAvailability(skillName, agent, opts);
  if (availability.status === "available") return availability;
  if (!availability.sourcePath || !availability.installMethod) {
    throw new Error(`Workflow skill "${skillName}" is not available from another root or this build`);
  }

  const targetRoot = path.dirname(availability.targetPath);
  assertSafeProjectRelativePath(targetRoot, skillName, "workflow skill install");
  await fs.promises.mkdir(targetRoot, { recursive: true });
  if (fs.existsSync(availability.targetPath)) {
    throw new Error(`Workflow skill destination already exists: ${availability.targetPath}`);
  }

  if (availability.installMethod === "copy") {
    await copySkillTree(availability.sourcePath, availability.targetPath);
  } else {
    const createSymlink = opts.createSymlink
      ?? ((source: string, target: string) => fs.promises.symlink(source, target, "junction"));
    try {
      await createSymlink(availability.sourcePath, availability.targetPath);
    } catch (error) {
      if (!canCopyAfterSymlinkError(error)) throw error;
      if (fs.existsSync(availability.targetPath)) {
        throw new Error(`Workflow skill destination already exists: ${availability.targetPath}`);
      }
      await copySkillTree(availability.sourcePath, availability.targetPath);
    }
  }

  return readActionWorkflowAvailability(skillName, agent, opts);
}
