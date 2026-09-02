# Theming: styles, appearance, terminal colors

Two ORTHOGONAL axes on `<html>`, both honoured by both styles:

| axis | attribute | values |
|---|---|---|
| style | `data-minimal` | absent = painted (pixel-art art), `"true"` = flat |
| appearance | `data-theme` | `dark` / `light` |

Painted was dark-only historically; it is not any more. Four sites reconcile these and **must change together or the first paint flashes**: `applyTheme` (`src/lib/use-theme.ts`), `applyThemeStyle` (`src/lib/theme-style.ts`), the pre-hydration script in `src/routes/__root.tsx`, and the Appearance control in `ThemeSettingsPage`.

## Token layers (`src/styles.css`)

Physical tokens (`--bg`, `--surface-0..3`, `--text*`, `--accent*`, `--status-*`) → a semantic alias layer (`--background`, `--card`, `--foreground`, `--primary`, `--status-*-bg`, `--action-*`). **Re-binding the physical layer re-themes the whole app**; prefer semantic names in components.

Cascade trap: the light block is `:root[data-theme="light"]`. The bare attribute selector would tie with the flat palette block (`[data-minimal="true"]`, later in the file) and lose on source order, silently reverting flat-light to its dark ladder. Painted's warm-paper deltas sit in `:root:not([data-minimal="true"])[data-theme="light"]`.

## Painted art has a light cut

`scripts/generate-light-borders.mjs` writes a `-light` sibling for each `public/borders/*.png`, remapping HSL lightness while preserving hue/saturation. Re-run after retuning the `BANDS` table; outputs are committed.

- Buttons/fields **invert** (dark fill + light rim → light fill + darker rim); panel rings and shell also invert so the body goes near-paper and edge detail becomes the line. Lifting instead produces solid slabs.
- `desat` per band matters: on the shell and resting ring the accent is grunge *texture* that becomes loud speckle once the ground is lifted; on the focus ring and outlined button it is signal and must survive.
- `panel_focused_*` is orange-hued **throughout** (even its "black" is fully saturated dark orange) — lifting it yields a solid orange slab.
- HSL bleaches saturated pixels toward white near L=1, so saturated pixels are capped (`CHROMA_SAFE_L`).
- `button_filled_*` has no light cut: a solid accent CTA already reads on paper, and lightening it would drop its white label below AA.

**The four per-accent frame URLs cannot be built in CSS** (`url()` can't concatenate), so `frameArtVars`/`applyFrameArt` (`src/lib/accent-colors.ts`) write them as INLINE styles — which beat any stylesheet rule. They must be re-applied on an accent change, a theme flip AND a style switch. The pre-hydration script binds them for every accent including the default, whose URLs otherwise come from `:root`.

Two painted surfaces are opaque ART, not rings, so they ignore `--surface-*`: `CardFrame` paints the panel PNG as a background layer sampling its centre, and the button/input frames slice with `fill`. Hence `--mc-card-fill` / `--mc-card-scrim` (light drops the art layer for a paper ground) and `--mc-frame-ink`.

`screen` blend is ~a no-op on a light ground — effects using it (cursor glow, pinned running sweep) vanish and need `multiply` under `[data-theme="light"]`.

## Terminal colors (`src/lib/terminal-options.ts`)

Style-agnostic: `getTerminalColorScheme()` reads `data-theme` only. Transparency is flat-dark only (`allowTransparency` thins dark ink on paper).

Two independent problems on the light ground:

1. **Agent CLIs emit 256-colour/truecolour SGR**, which never touches the 16-slot ramp — measured 1.2–2.0:1 against paper. Only `minimumContrastRatio` reaches those (4.5 on light, 1 on dark so hand-tuned dark palettes aren't flattened). Must be re-applied beside the theme on a live scheme switch (`TerminalPane.tsx`) or panes stay washed out until reload.
2. **The ramp itself**: "bright" on a light ground cannot mean *lighter* — that is the direction that loses contrast. Bright slots carry more saturation instead. A test asserts every light slot ≥4.5:1 against both light grounds (`#fdfbf6` painted, `#ffffff` flat); they had drifted below unnoticed once.
