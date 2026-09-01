import { useCallback, useEffect, useState } from "react";

import { getElectron } from "~/lib/electron";
import { applyFrameArt } from "~/lib/accent-colors";

export type Theme = "dark" | "light";

/** Native window grounds per style × appearance — keep in sync with --bg in
 *  styles.css so resize gutters and the launch flash match the page. The two
 *  light grounds differ on purpose: flat's is a cool SaaS gray, painted's is
 *  warm paper (see the painted-light block in styles.css).
 *
 *  This value is also what Electron classifies by luminance to derive the
 *  app theme and the COLORFGBG / MC_THEME hints handed to spawned agent PTYs
 *  (electron/app-theme.ts), so it must track the appearance, never the
 *  darkness of the painted chrome sitting on top of it. */
const WINDOW_BACKGROUND: Record<"painted" | "flat", Record<Theme, string>> = {
  painted: { dark: "#000000", light: "#f3f1ec" },
  flat: { dark: "#000000", light: "#f4f4f6" },
};

/** Push the effective DOM theme's ground to the Electron window so the native
 *  frame (launch flash, resize gutters) matches. No-op in the browser. */
export function syncWindowBackground(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const style = root.getAttribute("data-minimal") === "true" ? "flat" : "painted";
  const effective: Theme =
    root.getAttribute("data-theme") === "light" ? "light" : "dark";
  void getElectron()?.setWindowBackgroundColor?.(WINDOW_BACKGROUND[style][effective]);
}

const KEY = "mc.theme";

/** localStorage key for the dark/light preference. Shared with the
 *  pre-hydration script in __root.tsx. */
export const THEME_CACHE_KEY = KEY;

/**
 * The cached dark/light preference (defaults to dark). Shared with
 * `applyThemeStyle` and the pre-hydration script so the choice survives
 * reloads with no flash. Both theme styles honour it.
 */
export function readCachedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Apply the dark/light preference. Both theme styles honour it — the two
 *  axes (style via `data-minimal`, appearance via `data-theme`) are
 *  independent. */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  // The painted frame art has a separate light cut, and its URLs are inline
  // styles, so the appearance flip has to rebind them explicitly.
  applyFrameArt();
  syncWindowBackground();
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Dark/light theme hook. Avoids React 19 hydration mismatches by NEVER
 * rendering the `data-theme` attribute via JSX on `<html>`; instead it seeds
 * from the default and mutates `document.documentElement` post-hydration.
 *
 * The preference applies to both theme styles and survives switching between
 * them (see applyThemeStyle).
 */
export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>("dark");

  // Restore the cached preference on mount and reconcile the DOM.
  useEffect(() => {
    const cached = readCachedTheme();
    setThemeState(cached);
    applyTheme(cached);
  }, []);

  const set = useCallback((next: Theme) => {
    setThemeState(next);
    persistTheme(next);
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      persistTheme(next);
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle, set };
}
