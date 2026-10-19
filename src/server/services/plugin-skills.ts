import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { splitFrontmatter } from "~/shared/frontmatter";

export type PluginSkill = {
  agent: "claude-code" | "codex";
  name: string;
  qualifiedName: string;
  dir: string;
};

export type PluginSkillsOptions = {
  projectPath?: string | null;
  homeDir?: string;
  pluginSkills?: PluginSkill[];
};

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && NAME.test(value);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readJson(file: string): Record<string, unknown> {
  try { return object(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return {}; }
}

function directories(root: string): string[] {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith(".") && (entry.isDirectory() || entry.isSymbolicLink()))
      .map((entry) => path.join(root, entry.name)).sort();
  } catch { return []; }
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function skillDirectories(root: string, manifest: Record<string, unknown>): string[] {
  const declared = typeof manifest.skills === "string" ? [manifest.skills]
    : Array.isArray(manifest.skills) ? manifest.skills.filter((value: unknown) => typeof value === "string") : [];
  const found = new Set<string>();
  let canonicalRoot: string;
  try { canonicalRoot = fs.realpathSync(root); } catch { return []; }
  for (const component of ["skills", ...declared]) {
    const target = path.resolve(root, component);
    if (!within(root, target)) continue;
    for (const dir of [target, ...directories(target)]) {
      try {
        const canonical = fs.realpathSync(dir);
        if (within(canonicalRoot, canonical) && fs.statSync(path.join(canonical, "SKILL.md")).isFile()) {
          found.add(canonical);
        }
      } catch { /* Missing optional skill directories do not disable the plugin. */ }
    }
  }
  return [...found];
}

function pluginEntries(root: string, agent: PluginSkill["agent"]): PluginSkill[] {
  const claudeManifest = readJson(path.join(root, ".claude-plugin", "plugin.json"));
  const manifest = validName(claudeManifest.name) ? claudeManifest : readJson(path.join(root, ".codex-plugin", "plugin.json"));
  if (!validName(manifest.name)) return [];
  return skillDirectories(root, manifest).flatMap((dir) => {
    try {
      const frontmatter = splitFrontmatter(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"));
      const metadata = frontmatter ? object(parseYaml(frontmatter.frontmatterLines.join("\n"))) : {};
      const name = metadata.name ?? path.basename(dir);
      return validName(name) ? [{ agent, name, qualifiedName: `${manifest.name}:${name}`, dir }] : [];
    } catch { return []; }
  });
}

function claudePlugins(home: string, project: string | null): PluginSkill[] {
  const registry = readJson(path.join(home, ".claude", "plugins", "installed_plugins.json"));
  const settings = [path.join(home, ".claude", "settings.json"),
    ...(project ? [path.join(project, ".claude", "settings.json"), path.join(project, ".claude", "settings.local.json")] : [])];
  const enabled: Record<string, unknown> = Object.assign({}, ...settings.map((file) => object(readJson(file).enabledPlugins)));
  const plugins: PluginSkill[] = [];
  for (const [id, records] of Object.entries(object(registry.plugins))) {
    if (enabled[id] === false || !Array.isArray(records)) continue;
    const scoped = records.map(object).filter((record) => {
      if (typeof record.installPath !== "string") return false;
      if (record.scope === "user" || record.scope === "managed") return true;
      return project !== null && typeof record.projectPath === "string"
        && path.resolve(record.projectPath) === project;
    }).sort((a, b) => Number(b.scope === "local" || b.scope === "project") - Number(a.scope === "local" || a.scope === "project"));
    if (typeof scoped[0]?.installPath === "string") plugins.push(...pluginEntries(scoped[0].installPath, "claude-code"));
  }
  return plugins;
}

// Only plugin enablement is needed here; other TOML sections can contain secrets.
function codexEnablement(file: string): Map<string, boolean> {
  const enabled = new Map<string, boolean>();
  let content: string;
  try { content = fs.readFileSync(file, "utf8"); } catch { return enabled; }
  let plugin: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const section = line.match(/^\s*\[plugins\.(?:"([^"\\]+)"|'([^']+)'|([\w@-]+))\]\s*(?:#.*)?$/);
    if (section) plugin = section[1] ?? section[2] ?? section[3];
    else if (/^\s*\[/.test(line)) plugin = null;
    else if (plugin) {
      const flag = line.match(/^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/);
      if (flag) enabled.set(plugin, flag[1] === "true");
    }
  }
  return enabled;
}

function codexPlugins(home: string, project: string | null): PluginSkill[] {
  const enabled = codexEnablement(path.join(home, ".codex", "config.toml"));
  if (project) for (const [id, flag] of codexEnablement(path.join(project, ".codex", "config.toml"))) enabled.set(id, flag);
  const plugins: PluginSkill[] = [];
  for (const [id, flag] of enabled) {
    if (!flag) continue;
    const [plugin, marketplace, extra] = id.split("@");
    if (extra || !validName(plugin) || !validName(marketplace)) continue;
    const versions = directories(path.join(home, ".codex", "plugins", "cache", marketplace, plugin))
      .sort((a, b) => {
        const [aCore, aPrerelease] = path.basename(a).split("-", 2);
        const [bCore, bPrerelease] = path.basename(b).split("-", 2);
        return bCore.localeCompare(aCore, "en", { numeric: true })
          || Number(!!aPrerelease) - Number(!!bPrerelease)
          || path.basename(b).localeCompare(path.basename(a), "en", { numeric: true });
      });
    for (const version of versions) {
      const entries = pluginEntries(version, "codex");
      if (entries.length) { plugins.push(...entries); break; }
    }
  }
  return plugins;
}

export function discoverPluginSkills(opts: PluginSkillsOptions = {}): PluginSkill[] {
  if (opts.pluginSkills) return opts.pluginSkills;
  const home = path.resolve(opts.homeDir ?? os.homedir());
  const project = opts.projectPath ? path.resolve(opts.projectPath) : null;
  const found = new Map<string, PluginSkill>();
  for (const entry of [...claudePlugins(home, project), ...codexPlugins(home, project)]) {
    const key = `${entry.agent}:${entry.qualifiedName}`;
    if (!found.has(key)) found.set(key, entry);
  }
  return [...found.values()];
}
