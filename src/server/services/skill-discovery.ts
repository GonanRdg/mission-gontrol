import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseSkillAction, type SkillAction } from "~/shared/skill-actions";
import { resolveBundledSkillsRoot } from "../bundled-skills-path";

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

export type DiscoveredAction =
  | { name: string; origin: ActionOrigin; ok: true; action: SkillAction }
  | { name: string; origin: ActionOrigin; ok: false; error: string };

export type DiscoverActionsOptions = {
  /** Absolute path of the project in scope; omitted drops the project tier. */
  projectPath?: string | null;
  /** Overridable for tests. */
  homeDir?: string;
  /** Overridable for tests; `null` skips the bundled tier. */
  bundledRoot?: string | null;
};

type Root = { kind: ActionRootKind; dir: string };

function actionRoots(opts: DiscoverActionsOptions): Root[] {
  const home = opts.homeDir ?? os.homedir();
  const roots: Root[] = [];
  if (opts.projectPath) {
    const project = path.resolve(opts.projectPath);
    roots.push({ kind: "project-claude", dir: path.join(project, ".claude", "skills") });
    roots.push({ kind: "project-codex", dir: path.join(project, ".codex", "skills") });
  }
  roots.push({ kind: "user-claude", dir: path.join(home, ".claude", "skills") });
  roots.push({ kind: "user-codex", dir: path.join(home, ".codex", "skills") });
  const bundled = opts.bundledRoot === undefined ? resolveBundledSkillsRoot() : opts.bundledRoot;
  if (bundled) roots.push({ kind: "bundled", dir: bundled });
  return roots;
}

/**
 * Skill directories directly under `root`. Dot-directories are skipped, which
 * is what keeps `~/.codex/skills/.system/` — Codex's own built-ins — out.
 * Plugin marketplaces are not scanned at all: they mirror the same skill under
 * `skills/`, `.cursor/skills/` and `.windsurf/skills/`, so they need dedupe
 * rules of their own first.
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
    .map((entry) => path.join(root, entry.name))
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

      const origin: ActionOrigin = { kind: root.kind, dir };
      found.set(
        parsed.name,
        parsed.ok
          ? { name: parsed.name, origin, ok: true, action: parsed.action }
          : { name: parsed.name, origin, ok: false, error: parsed.error },
      );
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
