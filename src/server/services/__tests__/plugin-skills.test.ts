import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverPluginSkills } from "../plugin-skills";
import { discoverActions, discoverWorkflowSkillNames } from "../skill-discovery";
import { installActionWorkflow, readActionWorkflowAvailability } from "../install-action-workflow";

let root: string;
let home: string;
let project: string;
function write(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}
function json(file: string, value: unknown) { write(file, JSON.stringify(value)); }
function plugin(agent: "claude" | "codex", name = "lodgify-workflows", version = "0.0.4", skills?: string[]) {
  const dir = path.join(home, `.${agent}`, "plugins/cache/test-market", name, version);
  json(path.join(dir, ".claude-plugin/plugin.json"), { name, version, ...(skills ? { skills } : {}) });
  write(path.join(dir, "skills/implement-ticket/SKILL.md"), "---\nname: implement-ticket\n---\nImplement.\n");
  return dir;
}
function register(dir: string, extra = {}) {
  json(path.join(home, ".claude/plugins/installed_plugins.json"), {
    version: 2, plugins: { "lodgify-workflows@test-market": [{ scope: "user", installPath: dir, ...extra }] },
  });
}
function options() { return { homeDir: home, projectPath: project, bundledRoots: [] }; }

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-plugin-skills-"));
  home = path.join(root, "home");
  project = path.join(root, "project");
  fs.mkdirSync(project, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("enabled plugin skills", () => {
  it("uses Claude's installed version and qualified command without mirroring", async () => {
    const installed = plugin("claude");
    plugin("claude", "lodgify-workflows", "99.0.0");
    register(installed);
    json(path.join(home, ".claude/settings.json"), { enabledPlugins: { "lodgify-workflows@test-market": true } });

    const available = await installActionWorkflow("implement-ticket", "claude-code", options());
    expect(available).toMatchObject({
      status: "available", origin: "plugin", invocation: "lodgify-workflows:implement-ticket",
      sourcePath: fs.realpathSync(path.join(installed, "skills/implement-ticket")), installMethod: null,
    });
    expect(fs.existsSync(path.join(home, ".claude/skills"))).toBe(false);
    expect(discoverWorkflowSkillNames(options())).toEqual(["implement-ticket", "lodgify-workflows:implement-ticket"]);
    expect(readActionWorkflowAvailability("lodgify-workflows:implement-ticket", "codex", options()).status).toBe("unavailable");
  });

  it("honors Claude project overrides and installation scopes", () => {
    register(plugin("claude"), { scope: "project", projectPath: project });
    expect(discoverPluginSkills(options())).toHaveLength(1);
    expect(discoverPluginSkills({ ...options(), projectPath: path.join(root, "other-project") })).toEqual([]);
    json(path.join(project, ".claude/settings.local.json"), { enabledPlugins: { "lodgify-workflows@test-market": false } });
    expect(discoverPluginSkills(options())).toEqual([]);
  });

  it("resolves Codex enablement and the newest cached version without scanning disabled caches", () => {
    plugin("codex", "lodgify-workflows", "0.0.2");
    const latest = plugin("codex", "lodgify-workflows", "0.0.10");
    plugin("codex", "disabled-plugin", "99.0.0");
    write(path.join(home, ".codex/config.toml"), '[plugins."lodgify-workflows@test-market"]\nenabled = true\n[plugins."disabled-plugin@test-market"]\nenabled = false\n');
    expect(discoverPluginSkills(options())).toEqual([
      expect.objectContaining({ agent: "codex", dir: fs.realpathSync(path.join(latest, "skills/implement-ticket")) }),
    ]);
    write(path.join(project, ".codex/config.toml"), "[plugins.'lodgify-workflows@test-market']\nenabled = false # local override\n");
    expect(discoverPluginSkills(options())).toEqual([]);
  });

  it("honors nested manifest paths, declared names and deduplicates mirrored paths", () => {
    const dir = plugin("claude", "lodgify-workflows", "0.0.4", ["./skills/engineering/review", "./skills/engineering", "./skills"]);
    write(path.join(dir, "skills/engineering/review/SKILL.md"), "---\nname: code-review\n---\nReview.\n");
    write(path.join(dir, ".cursor/skills/duplicate/SKILL.md"), "---\nname: unwanted-mirror\n---\n");
    register(dir);
    expect(discoverPluginSkills(options()).map((entry) => entry.name).sort()).toEqual(["code-review", "implement-ticket"]);
  });

  it("ignores invalid metadata and paths outside a plugin", () => {
    const outside = path.join(root, "outside");
    write(path.join(outside, "SKILL.md"), "---\nname: outside\n---\n");
    const dir = plugin("claude", "lodgify-workflows", "0.0.4", [outside, "../../../../../../outside"]);
    fs.symlinkSync(outside, path.join(dir, "skills/escape"));
    write(path.join(dir, "skills/broken/SKILL.md"), "---\nname: [broken\n---\n");
    register(dir);
    expect(discoverPluginSkills(options()).map((entry) => entry.name)).toEqual(["implement-ticket"]);
    write(path.join(home, ".claude/plugins/installed_plugins.json"), "invalid JSON");
    expect(discoverPluginSkills(options())).toEqual([]);
  });

  it("keeps loose agent skills first and enabled plugins ahead of the bundled fallback", () => {
    register(plugin("claude"));
    const bundled = path.join(root, "bundled");
    write(path.join(bundled, "implement-ticket/SKILL.md"), "Bundled.\n");
    const opts = { ...options(), bundledRoots: [bundled] };
    expect(readActionWorkflowAvailability("implement-ticket", "claude-code", opts).origin).toBe("plugin");
    write(path.join(project, ".claude/skills/implement-ticket/SKILL.md"), "Project.\n");
    expect(readActionWorkflowAvailability("implement-ticket", "claude-code", opts).origin).toBe("project");
    expect(readActionWorkflowAvailability("lodgify-workflows:implement-ticket", "claude-code", opts).origin).toBe("plugin");
  });

  it("requires a qualified choice when two plugins expose the same skill", () => {
    const first = plugin("claude");
    const second = plugin("claude", "other-plugin");
    json(path.join(home, ".claude/plugins/installed_plugins.json"), { plugins: {
      "lodgify-workflows@test-market": [{ scope: "user", installPath: first }],
      "other-plugin@test-market": [{ scope: "user", installPath: second }],
    } });
    expect(readActionWorkflowAvailability("implement-ticket", "claude-code", options()).status).toBe("unavailable");
    expect(readActionWorkflowAvailability("other-plugin:implement-ticket", "claude-code", options())).toMatchObject({
      status: "available", invocation: "other-plugin:implement-ticket",
    });
    expect(() => readActionWorkflowAvailability("other-plugin:../outside", "claude-code", options())).toThrow();
  });

  it("discovers action wrappers declared by enabled plugins", () => {
    const dir = plugin("claude");
    write(path.join(dir, "skills/action-implement/SKILL.md"), `---
name: action-implement
mc-action:
  title: Implement
  skill: implement-ticket
  prompt: /implement-ticket
---\n`);
    register(dir);
    expect(discoverActions(options())).toEqual([
      expect.objectContaining({ ok: true, name: "action-implement", origin: { kind: "claude-plugin", dir: fs.realpathSync(path.join(dir, "skills/action-implement")) } }),
    ]);
  });

  it("prefers a stable Codex cache over a prerelease of the same version", () => {
    const stable = plugin("codex", "lodgify-workflows", "1.0.0");
    plugin("codex", "lodgify-workflows", "1.0.0-rc.1");
    write(path.join(home, ".codex/config.toml"), '[plugins."lodgify-workflows@test-market"]\nenabled = true\n');
    expect(discoverPluginSkills(options())[0]?.dir).toBe(fs.realpathSync(path.join(stable, "skills/implement-ticket")));
  });
});
