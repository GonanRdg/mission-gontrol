#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/sync-workflow-skills.mjs <lodgify-workflows-plugin>");
const pluginRoot = path.resolve(source);
const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
if (manifest.name !== "lodgify-workflows") throw new Error("Expected the lodgify-workflows plugin");
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.agents/skills");
for (const name of ["implement-ticket", "investigate-issue", "verify-claims", "optimize-skill", "write-adr"]) {
  const from = path.join(pluginRoot, "skills", name);
  if (!fs.statSync(path.join(from, "SKILL.md")).isFile()) throw new Error(`Missing skill: ${name}`);
  fs.cpSync(from, path.join(target, name), { recursive: true });
  console.log(`Synced ${manifest.name}@${manifest.version}: ${name}`);
}
