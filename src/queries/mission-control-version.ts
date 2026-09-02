// The running build's version, injected at build time (see
// scripts/lib/build-version.mjs) and surfaced in Settings → About and the
// window title.
//
// Upstream also polls its own site here for the newest published release and
// offers a download when one outranks the running build. This fork is
// distributed independently: it runs no release feed and deliberately does not
// use the upstream project's, so there is nothing to check and that whole path
// is gone. Updating means downloading a newer release and replacing the app.

declare const __MC_VERSION__: string;

export const CURRENT_MC_VERSION: string =
  typeof __MC_VERSION__ !== "undefined" ? __MC_VERSION__ : "0.0.0";
