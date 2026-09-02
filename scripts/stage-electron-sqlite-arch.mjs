#!/usr/bin/env node
// Stage the better-sqlite3 Electron binding for a macOS arch other than this
// machine's, so a cross-arch `electron-builder --mac --x64` produces an app that
// actually runs.
//
//   node scripts/stage-electron-sqlite-arch.mjs --arch x64
//
// Why this is needed
// ------------------
// resolveElectronBetterSqlite3NativeBinding() (src/db/better-sqlite3-native-binding.ts)
// resolves the binding at RUNTIME from the running process:
//
//   better-sqlite3/bin/<platform>-<process.arch>-<process.versions.modules>/better-sqlite3.node
//
// and throws if it is missing — it does not fall back to build/Release. So an
// x64 app needs `bin/darwin-x64-<abi>/`, and `pnpm native:electron:sqlite` only
// ever stages the arch of the Electron running on THIS machine. Package an x64
// build from an arm64 machine and the bundle ships `bin/darwin-arm64-<abi>/`
// only; on an Intel Mac the resolver looks for the x64 directory, finds nothing
// and throws at database init.
//
// Nothing here needs compiling: better-sqlite3 publishes a prebuilt binding per
// (version, electron ABI, platform, arch). This downloads that tarball and
// extracts the single file, deliberately NOT going through prebuild-install,
// which writes to build/Release — the path this machine's own arm64 binding
// lives at. Staging is purely additive: both arch directories can coexist, and
// each build then carries a binding for whichever machine ends up running it.
//
// node-pty needs no equivalent: it is loaded as a plain `require("node-pty")`
// and its own loader picks `prebuilds/darwin-<arch>/` at runtime, which the
// package already ships for both arches.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { betterSqliteRoot } from "./lib/better-sqlite.mjs";

const requireFromHere = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const archArg = argv.indexOf("--arch");
const targetArch = archArg >= 0 ? argv[archArg + 1] : null;
if (!targetArch || !["x64", "arm64"].includes(targetArch)) {
  console.error("usage: stage-electron-sqlite-arch.mjs --arch <x64|arm64>");
  process.exit(1);
}

const platform = "darwin";
const version = requireFromHere("better-sqlite3/package.json").version;
const electronPath = requireFromHere("electron");

// The ABI is a property of the Electron version, not of the arch, so reading it
// from the local (arm64) Electron is correct for the x64 binding too.
const abiResult = spawnSync(
  electronPath,
  ["-e", "process.stdout.write(process.versions.modules)"],
  { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
);
if (abiResult.status !== 0) {
  console.error(abiResult.stderr || "failed to read the Electron ABI");
  process.exit(1);
}
const abi = abiResult.stdout.trim();

const destDir = path.join(betterSqliteRoot, "bin", `${platform}-${targetArch}-${abi}`);
const dest = path.join(destDir, "better-sqlite3.node");

if (existsSync(dest)) {
  console.log(`[native] ${platform}-${targetArch}-${abi} binding already staged`);
  process.exit(0);
}

const url =
  `https://github.com/WiseLibs/better-sqlite3/releases/download/v${version}` +
  `/better-sqlite3-v${version}-electron-v${abi}-${platform}-${targetArch}.tar.gz`;

console.log(`[native] fetching ${platform}-${targetArch} binding for Electron ABI ${abi}`);

const dl = spawnSync("curl", ["-fsSL", url], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
if (dl.status !== 0) {
  console.error(`[native] download failed: ${url}`);
  console.error("No prebuilt binding published for this version/ABI/arch combination.");
  process.exit(1);
}

// The tarball lays the binding out at build/Release/better_sqlite3.node.
const extract = spawnSync(
  "tar",
  ["-xzO", "-f", "-", "build/Release/better_sqlite3.node"],
  { input: dl.stdout, maxBuffer: 64 * 1024 * 1024 },
);
if (extract.status !== 0 || !extract.stdout?.length) {
  console.error("[native] could not extract build/Release/better_sqlite3.node from the tarball");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
writeFileSync(dest, extract.stdout);

// Confirm what actually landed, rather than trusting the file name: a wrong-arch
// binding here fails at database init on the target machine, far from this step.
const probe = spawnSync("file", ["-b", dest], { encoding: "utf8" });
const described = (probe.stdout || "").trim();
const expected = targetArch === "x64" ? "x86_64" : "arm64";
if (!described.includes(expected)) {
  console.error(`[native] staged binding is not ${expected}: ${described}`);
  process.exit(1);
}

console.log(`[native] staged ${path.relative(process.cwd(), dest)} (${described})`);
