#!/usr/bin/env node
// Replace the installed MissionControl.app with a fresh local build.
//
// Usage:
//   pnpm install:local [--skip-build] [--arch arm64|x64]
//                      [--app /Applications/MissionControl.app]
//                      [--backup-dir ~/.Trash] [--no-resign]
//
// The swap is two rename(2) calls against a bundle staged in the same
// directory — never a delete or copy over the live bundle. A running app holds
// its own inodes, so renaming its bundle out from under it leaves it running
// (this script is normally run from a session *inside* that app); the new build
// is picked up on the next launch.
//
// Builds with electron-builder `--dir`: an .app only, no DMG/ZIP, since nothing
// here is distributed. Use `pnpm release:local` to publish real artifacts.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { arch as hostArch, homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { makeFail } from "./lib/cli.mjs";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
process.chdir(REPO_ROOT);

const fail = makeFail("install-local");
const log = (message) => console.log(`[install-local] ${message}`);

if (process.platform !== "darwin") {
  fail("macOS only — on Windows/Linux install the artifact from `pnpm dist:win` / `pnpm dist:linux`");
}

// ---------- args ----------
const args = process.argv.slice(2);
function getArg(name, { boolean = false } = {}) {
  const flag = `--${name}`;
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    const value = inline.slice(flag.length + 1);
    return boolean ? value !== "false" : value;
  }
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  if (boolean) return true;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

const skipBuild = Boolean(getArg("skip-build", { boolean: true }));
const resign = !getArg("no-resign", { boolean: true });
const arch = getArg("arch") ?? (hostArch() === "x64" ? "x64" : "arm64");
if (!["arm64", "x64"].includes(arch)) fail(`unknown --arch: ${arch}`);
const targetApp = resolve(getArg("app") ?? "/Applications/MissionControl.app");
const backupDir = resolve(getArg("backup-dir") ?? join(homedir(), ".Trash"));

// ---------- helpers ----------
function run(cmd, argv, opts = {}) {
  log(`$ ${cmd} ${argv.join(" ")}`);
  const res = spawnSync(cmd, argv, { stdio: "inherit", shell: false, ...opts });
  if (res.status !== 0) fail(`command failed: ${cmd} ${argv.join(" ")}`);
}

function nodeMajor(nodeBin) {
  const res = spawnSync(nodeBin, ["-v"], { encoding: "utf8" });
  if (res.status !== 0) return null;
  return Number.parseInt(res.stdout.trim().replace(/^v/, "").split(".")[0] ?? "", 10);
}

/**
 * Where to build from. The native modules and electron-builder run under the
 * Node 24 the engines field pins, whatever Node happens to be running this
 * script, and pnpm comes from that toolchain (or corepack with the
 * packageManager pin) rather than assuming a global install.
 */
function resolveToolchain() {
  const own = dirname(process.execPath);
  const binDir = [own, "/opt/homebrew/opt/node@24/bin", "/usr/local/opt/node@24/bin"].find(
    (dir) => existsSync(join(dir, "node")) && nodeMajor(join(dir, "node")) === 24,
  );
  if (!binDir) {
    fail(
      `the build needs Node 24 (package.json engines); running ${process.version} and no node@24 found ` +
        "in /opt/homebrew/opt/node@24/bin or /usr/local/opt/node@24/bin",
    );
  }
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
  if (binDir !== own) log(`building with Node 24 from ${binDir} (this script runs ${process.version})`);

  const local = join(binDir, "pnpm");
  if (existsSync(local)) return { env, pnpm: local, pnpmArgs: [] };
  if (spawnSync("pnpm", ["--version"], { env, stdio: "ignore" }).status === 0) {
    return { env, pnpm: "pnpm", pnpmArgs: [] };
  }
  const corepack = existsSync(join(binDir, "corepack")) ? join(binDir, "corepack") : "corepack";
  const pin = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).packageManager;
  if (!pin?.startsWith("pnpm@")) fail("no pnpm on PATH and no pnpm packageManager pin to hand corepack");
  if (spawnSync(corepack, ["--version"], { env, stdio: "ignore" }).status !== 0) {
    fail("no pnpm and no corepack available — install pnpm to build");
  }
  return { env, pnpm: corepack, pnpmArgs: [pin] };
}

/** Short version string of an .app bundle, or null when unreadable. */
function bundleVersion(appPath) {
  const res = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", join(appPath, "Contents", "Info.plist")],
    { encoding: "utf8" },
  );
  if (res.status !== 0) return null;
  return res.stdout.trim() || null;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
}

// ---------- build ----------
if (!skipBuild) {
  const { env, pnpm, pnpmArgs } = resolveToolchain();
  const pnpmRun = (argv) => run(pnpm, [...pnpmArgs, ...argv], { env });

  // The whisper payload is a large one-time download; only fetch it when the
  // extraResources dir electron-builder reads from is actually missing.
  if (!existsSync(join(REPO_ROOT, "resources", "whisper", "whisper-server"))) {
    pnpmRun(["setup:whisper"]);
  }
  pnpmRun(["build"]);
  pnpmRun(["native:electron"]);
  // --dir: an .app, no DMG/ZIP — nothing here leaves the machine.
  pnpmRun(["exec", "electron-builder", "--mac", `--${arch}`, "--dir", "--publish", "never"]);
}

// ---------- locate the build ----------
const OUT_DIR = join(REPO_ROOT, "dist-electron-out");
const candidates = [
  join(OUT_DIR, `mac-${arch}`),
  join(OUT_DIR, "mac-universal"),
  // electron-builder drops the arch suffix for the host-default x64 layout.
  arch === "x64" ? join(OUT_DIR, "mac") : null,
].filter(Boolean);

const builtApp = candidates
  .map((dir) => join(dir, basename(targetApp)))
  .find((app) => existsSync(join(app, "Contents", "MacOS")));
if (!builtApp) {
  fail(
    `no built ${basename(targetApp)} under ${OUT_DIR} (looked in ${candidates
      .map((c) => basename(c))
      .join(", ")})${skipBuild ? " — drop --skip-build to build it" : ""}`,
  );
}

const builtVersion = bundleVersion(builtApp);
const installedVersion = existsSync(targetApp) ? bundleVersion(targetApp) : null;
log(
  `build ${builtVersion ?? "?"} (${arch}) → ${targetApp}` +
    (installedVersion ? ` (currently ${installedVersion})` : " (not installed yet)"),
);

// ---------- stage next to the target ----------
// Same directory ⇒ same volume ⇒ the swap below is a rename, not a copy.
const installDir = dirname(targetApp);
if (!existsSync(installDir)) fail(`install directory does not exist: ${installDir}`);

const staged = join(installDir, `.${basename(targetApp)}.incoming-${process.pid}`);
rmSync(staged, { recursive: true, force: true });

let swapped = false;
try {
  log(`staging → ${staged}`);
  run("/usr/bin/ditto", [builtApp, staged]);

  if (resign) {
    // Ad-hoc seal + TCC reset, on the staged bundle so the live app is never
    // touched before the swap. See docs/local-build-screen-recording.md.
    run(process.execPath, [join(REPO_ROOT, "scripts", "resign-local-macos.mjs"), staged]);
  }

  // ---------- swap ----------
  let backup = null;
  if (existsSync(targetApp)) {
    mkdirSync(backupDir, { recursive: true });
    backup = join(
      backupDir,
      `${basename(targetApp, ".app")}-${installedVersion ?? "unknown"}-${timestamp()}.app`,
    );
    try {
      renameSync(targetApp, backup);
    } catch (err) {
      if (err.code !== "EXDEV") throw err;
      // Backup dir is on another volume: keep the previous bundle beside the
      // target instead of copying it (a copy would widen the swap window).
      backup = `${targetApp}.bak-${timestamp()}`;
      renameSync(targetApp, backup);
    }
  }
  renameSync(staged, targetApp);
  swapped = true;

  log(`✓ installed ${builtVersion ?? "?"} at ${targetApp}`);
  if (backup) log(`  previous ${installedVersion ?? "?"} kept at ${backup}`);
  log("  quit MissionControl (Cmd+Q) and relaunch — the running instance is still the old build");
} finally {
  if (!swapped) rmSync(staged, { recursive: true, force: true });
}
