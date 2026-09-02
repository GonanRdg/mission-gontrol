// electron-builder afterPack hook — re-sign the packed macOS app ad-hoc.
//
// Runs after the .app is assembled and before the dmg/zip are built from it, so
// the signature ends up inside the artifact people download.
//
// Why this exists
// ---------------
// Electron's prebuilt binary arrives linker-signed ad-hoc. electron-builder then
// writes the app into the bundle and, with no signing identity configured, does
// not re-sign — so the seal no longer matches its contents. Gatekeeper reports
// that as a BROKEN signature:
//
//   code has no resources but signature indicates they must be present
//
// which is the "MissionControl is damaged and can't be opened" dialog, and macOS
// offers no override for it: Privacy & Security shows no "Open Anyway" button,
// so the only way in is `xattr -dr com.apple.quarantine`.
//
// Re-sealing the whole bundle ad-hoc makes the signature VALID while still being
// anonymous (no Developer ID, no Team ID). Gatekeeper then rejects it as an
// unidentified developer instead of as damaged — which is the flow that does
// offer "Open Anyway" in Privacy & Security.
//
// This is not a substitute for a Developer ID and notarization; it just moves the
// failure to the one macOS lets a user consciously accept. With real credentials
// (CSC_LINK + APPLE_*), set mac.identity and drop this hook.

import { spawnSync } from "node:child_process";
import path from "node:path";

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const entitlements = path.join(context.packager.info.projectDir, "build", "entitlements.mac.plist");

  const sign = spawnSync(
    "codesign",
    [
      "--force",
      // The bundle carries nested helpers and native .node files that each need
      // sealing; --deep is what install-local.mjs uses for the same job.
      "--deep",
      // Keep the hardened runtime the build config asks for. It is honoured for
      // an ad-hoc signature too, and dropping it here would silently weaken the
      // build relative to a signed release.
      "--options",
      "runtime",
      "--entitlements",
      entitlements,
      "--sign",
      "-",
      appPath,
    ],
    { stdio: "inherit" },
  );
  if (sign.status !== 0) {
    throw new Error(`ad-hoc signing failed for ${appPath}`);
  }

  // Verify the seal actually matches. Skipping this is how the broken signature
  // shipped in the first place — packaging succeeded and the problem only
  // surfaced on someone else's Mac.
  const verify = spawnSync("codesign", ["--verify", "--deep", "--strict", appPath], {
    encoding: "utf8",
  });
  if (verify.status !== 0) {
    throw new Error(
      `ad-hoc signature did not verify for ${appPath}:\n${verify.stderr || verify.stdout}`,
    );
  }

  console.log(`[afterPack] ad-hoc signed and verified ${appName} (${context.arch === 1 ? "x64" : "arm64"})`);
}
