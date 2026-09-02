import * as fs from "node:fs";
import * as path from "node:path";
import {
  DIAGRAM_SKILL_HARNESS_KEYS,
  DIAGRAM_SKILL_INSTALL_TARGETS,
  type DiagramSkillHarness,
} from "~/shared/diagram-skill-install";

const DIAGRAM_SKILL_NAME = "diagram";

/** Directories that may hold the bundled skill trees, most specific first. */
export function bundledSkillsRoots(): string[] {
  const roots: string[] = [];
  const serverEntry = process.env.SERVER_ENTRY?.trim();
  if (serverEntry) {
    roots.push(path.resolve(path.dirname(serverEntry), "..", "bundled-skills"));
  }
  roots.push(path.resolve(process.cwd(), ".agents", "skills"));
  roots.push(path.resolve(process.cwd(), "dist", "bundled-skills"));
  roots.push(path.resolve(process.cwd(), "dist-server", "bundled-skills"));
  return roots;
}

/** First bundled root that exists on disk, or null in a build without one. */
export function resolveBundledSkillsRoot(): string | null {
  return bundledSkillsRoots().find((root) => fs.existsSync(root)) ?? null;
}

function bundledSkillsCandidates(skillName: string): string[] {
  return bundledSkillsRoots().map((root) => path.join(root, skillName));
}

export function resolveBundledSkillDir(skillName: string): string {
  for (const candidate of bundledSkillsCandidates(skillName)) {
    if (fs.existsSync(path.join(candidate, "SKILL.md"))) return candidate;
  }
  throw new Error(`Bundled skill "${skillName}" is not available in this build`);
}

export function resolveDiagramSkillSourceDir(): string {
  return resolveBundledSkillDir(DIAGRAM_SKILL_NAME);
}

export function diagramSkillInstalledPaths(
  projectPath: string,
): Record<DiagramSkillHarness, boolean> {
  const installed = {} as Record<DiagramSkillHarness, boolean>;
  for (const harness of DIAGRAM_SKILL_HARNESS_KEYS) {
    const segments = DIAGRAM_SKILL_INSTALL_TARGETS[harness].segments;
    const skillFile = path.join(projectPath, ...segments, "SKILL.md");
    installed[harness] = fs.existsSync(skillFile);
  }
  return installed;
}
