#!/usr/bin/env node
// Generate the light-appearance variants of the painted border art.
//
//   node scripts/generate-light-borders.mjs [--check]
//
// The painted PNGs are near-black pixel strokes (90%+ of their opaque pixels
// sit below L=0.1) with sparse accent highlights. That reads as relief against
// painted's near-black ground, but on the light appearance's paper ground every
// frame becomes a black slab and every `fill`-sliced button becomes a dark chip
// scattered across a light page.
//
// So each source file gets a `-light` sibling whose HSL lightness is remapped
// while hue and saturation are preserved verbatim — the accent stays the accent,
// neutral art stays neutral. Two remap shapes are used:
//
//   invert  the art's own contrast polarity is flipped (dark fill / light rim
//           becomes light fill / dark rim). Used for surfaces that must read as
//           a light interactive chip: the gray button + input frame, and the
//           accent-bordered button.
//   lift    lightness is compressed upward into a mid band without flipping, so
//           the stroke stays DARKER than the paper and still reads as a frame.
//           Used for the panel rings and the window shell.
//
// button_filled_* is deliberately left alone: it is a solid accent CTA, and a
// saturated accent chip already reads correctly on a light ground.
//
// Re-run after retuning any BAND below; the outputs are committed.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const BORDERS = join(REPO_ROOT, "public", "borders");
const LIGHT_SUFFIX = "-light";
const checkOnly = process.argv.includes("--check");

/** Lightness bands per art class. `mode: "invert"` flips contrast polarity;
 *  `mode: "lift"` keeps it. Output lightness spans [lo, hi]. */
// `desat` scales the source saturation. It matters because the accent in this
// art is not always signal: on the shell and the resting panel ring it is
// grunge texture that reads as a faint glow against near-black, but turns into
// loud speckle once the ground beneath it is lifted to paper. Where the accent
// IS signal (the focus ring, the outlined button) it is kept.
const BANDS = {
  // Toolbar/ghost buttons and text fields. These slice with `fill`, so the
  // band decides the chip's actual surface colour — it sits just below the
  // paper ground so the chip reads as a raised control, with a darker rim.
  chip: { mode: "invert", lo: 0.74, hi: 0.94, desat: 0.4 },
  // The accent-outlined button. Same polarity as the chip, but the band runs
  // a little brighter and the accent rim is kept at full chroma.
  btnFrame: { mode: "invert", lo: 0.72, hi: 0.96, desat: 0 },
  // Resting session/panel ring. Inverted like the chip: the art's body goes
  // near-paper and its edge detail becomes the dark line, which is what a
  // frame on a light ground should be. Lifting instead turns the body into a
  // solid mid-grey band.
  panel: { mode: "invert", lo: 0.54, hi: 0.93, desat: 0.7 },
  // The focused ring, where the accent has to survive — it is what marks
  // focus. Note this art is orange-hued THROUGHOUT (even its near-black is a
  // fully saturated dark orange), so lifting it produces a solid orange slab;
  // inverting keeps the body pale and leaves the accent as the edge line.
  panelFocused: { mode: "invert", lo: 0.46, hi: 0.9, desat: 0.25 },
  // The window shell wraps the entire app, so anything with contrast or chroma
  // at that size dominates the page: it settles near the paper ground with just
  // enough edge detail to read as a rim.
  shell: { mode: "invert", lo: 0.74, hi: 0.96, desat: 0.85 },
};

function classify(name) {
  if (name.startsWith("button_filled_")) return null; // accent CTA — leave alone
  if (name === "button_gray.png") return "chip";
  if (name === "button.png" || name.startsWith("button_")) return "btnFrame";
  if (name.startsWith("panel_focused")) return "panelFocused";
  if (name.startsWith("square_") || name.startsWith("panel_")) return "panel";
  if (name.startsWith("shell")) return "shell";
  return null;
}

// ---- sRGB <-> HSL (hue/sat preserved exactly; only L is remapped) ----
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// The source art's useful lightness detail is crushed into roughly the bottom
// fifth of the range, so normalize against that before remapping — otherwise
// every output pixel collapses onto the band's endpoint and the pixel texture
// disappears.
const SRC_CEIL = 0.35;

// HSL collapses to white as L approaches 1 no matter what S says, so lifting a
// saturated accent pixel into the top of a band would bleach it. Saturated
// pixels are therefore held at or below this lightness; neutral pixels (the
// bulk of the frame art) are unaffected.
const CHROMA_SAFE_L = 0.6;

function remap(l, s, band) {
  const t = Math.min(1, l / SRC_CEIL);
  const shaped = band.mode === "invert" ? 1 - t : t;
  const next = band.lo + (band.hi - band.lo) * shaped;
  // Blend toward the capped value in proportion to how saturated the pixel is.
  return next * (1 - s) + Math.min(next, CHROMA_SAFE_L) * s;
}

function convert(file, cls) {
  const png = PNG.sync.read(readFileSync(file));
  const { data } = png;
  const band = BANDS[cls];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [h, s0, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const s = s0 * (1 - (band.desat ?? 0));
    const [r, g, b] = hslToRgb(h, s, remap(l, s, band));
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return PNG.sync.write(png);
}

const sources = readdirSync(BORDERS)
  .filter((f) => f.endsWith(".png") && !f.includes(LIGHT_SUFFIX))
  .sort();

let written = 0, skipped = 0, missing = 0;
for (const name of sources) {
  const cls = classify(name);
  if (!cls) { skipped++; continue; }
  const out = join(BORDERS, name.replace(/\.png$/, `${LIGHT_SUFFIX}.png`));
  if (checkOnly) {
    if (!existsSync(out)) { missing++; console.log(`missing: ${out.split("/").pop()}`); }
    continue;
  }
  writeFileSync(out, convert(join(BORDERS, name), cls));
  written++;
}

console.log(
  checkOnly
    ? `[light-borders] ${sources.length} sources, ${missing} missing`
    : `[light-borders] wrote ${written} light variants (${skipped} left as-is)`,
);
if (checkOnly && missing > 0) process.exit(1);
