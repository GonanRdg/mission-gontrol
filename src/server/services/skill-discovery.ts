import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SkillActionParse } from "~/shared/skill-actions";
import { bundledSkillsRoots } from "../bundled-skills-path";
import { parseSkillAction } from "./skill-actions";

/**
 * Where an action was found. Ordered by precedence: a project-local skill
 * shadows a global one of the same name, and both shadow the bundled copy.
 */
export const ACTION_ROOT_KINDS = [
  "project-claude",
  "project-codex",
  "user-claude",
  "user-codex",
  "bundled",
] as const;
export type ActionRootKind = (typeof ACTION_ROOT_KINDS)[number];

export type ActionOrigin = {
  kind: ActionRootKind;
  /** Directory holding the skill, e.g. `~/.claude/skills/implement-feature`. */
  dir: string;
};

export type DiscoveredAction = SkillActionParse & { origin: ActionOrigin };

export type DiscoverActionsOptions = {
  /** Absolute path of the project in scope; omitted drops the project tier. */
  projectPath?: string | null;
  /** Overridable for tests. */
  homeDir?: string;
  /** Overridable for tests; empty or `null` skips the bundled tier. */
  bundledRoots?: string[] | null;
};

function actionRoots(opts: DiscoverActionsOptions): ActionOrigin[] {
  const home = opts.homeDir ?? os.homedir();
  const roots: ActionOrigin[] = [];
  if (opts.projectPath) {
    const project = path.resolve(opts.projectPath);
    roots.push({ kind: "project-claude", dir: path.join(project, ".claude", "skills") });
    roots.push({ kind: "project-codex", dir: path.join(project, ".codex", "skills") });
  }
  roots.push({ kind: "user-claude", dir: path.join(home, ".claude", "skills") });
  roots.push({ kind: "user-codex", dir: path.join(home, ".codex", "skills") });
  // Every bundled root, not just the first that exists: a development tree has
  // both `.agents/skills` and `dist/bundled-skills`, and skipping the rest
  // would hide actions that install fine through the per-skill resolver.
  const bundled = opts.bundledRoots === undefined ? bundledSkillsRoots() : opts.bundledRoots;
  for (const dir of bundled ?? []) roots.push({ kind: "bundled", dir });
  return roots;
}

/**
 * Skill directories directly under `root`, in name order so two skills in one
 * root declaring the same name resolve the same way on every filesystem.
 * Dot-directories are skipped, which is what keeps `~/.codex/skills/.system/` —
 * Codex's own built-ins — out. Plugin marketplaces are not scanned at all: they
 * mirror the same skill under `skills/`, `.cursor/skills/` and
 * `.windsurf/skills/`, so they need dedupe rules of their own first.
 */
function skillDirsIn(root: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(root, name))
    .filter((dir) => fs.existsSync(path.join(dir, "SKILL.md")));
}

/**
 * Every action visible from `projectPath`, highest-precedence copy of each
 * name only. Skills without an `mc-action` block are not actions and never
 * appear; skills whose block fails to parse appear as broken entries so the
 * grid can show the error instead of silently losing a card.
 */
export function discoverActions(opts: DiscoverActionsOptions = {}): DiscoveredAction[] {
  const found = new Map<string, DiscoveredAction>();

  for (const root of actionRoots(opts)) {
    for (const dir of skillDirsIn(root.dir)) {
      let content: string;
      try {
        content = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
      } catch {
        continue;
      }
      const parsed = parseSkillAction(content, path.basename(dir));
      if (!parsed) continue;
      if (found.has(parsed.name)) continue;
      found.set(parsed.name, { ...parsed, origin: { kind: root.kind, dir } });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
