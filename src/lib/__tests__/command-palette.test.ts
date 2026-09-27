import { describe, expect, it } from "vitest";
import { createDoubleShiftDetector, rankPaletteItems } from "../command-palette";

const shift = { key: "Shift", repeat: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false };

describe("double Shift palette shortcut", () => {
  it("opens for two short standalone taps", () => {
    const detector = createDoubleShiftDetector();
    detector.keydown(shift, 0);
    expect(detector.keyup(shift, 50)).toBe(false);
    detector.keydown(shift, 180);
    expect(detector.keyup(shift, 220)).toBe(true);
  });

  it("does not open while typing, holding Shift, or pressing another modifier", () => {
    const detector = createDoubleShiftDetector();
    detector.keydown(shift, 0);
    detector.keydown({ ...shift, key: "A" }, 30);
    detector.keyup(shift, 50);
    detector.keydown(shift, 130);
    expect(detector.keyup(shift, 170)).toBe(false);
    detector.keydown(shift, 300);
    expect(detector.keyup(shift, 600)).toBe(false);
    detector.keydown(shift, 650);
    expect(detector.keyup({ ...shift, metaKey: true }, 680)).toBe(false);
  });
});

describe("palette ranking", () => {
  const items = [
    { id: "settings", label: "Settings" },
    { id: "git.pull", label: "Git: Pull (fast-forward)", detail: "project alpha · main" },
    { id: "project:alpha", label: "project alpha" },
  ];

  it("matches words across label and context, then ranks exact actions first", () => {
    expect(rankPaletteItems(items, "pull alpha").map((item) => item.id)).toEqual(["git.pull"]);
    expect(rankPaletteItems(items, "settings")[0]?.id).toBe("settings");
    expect(rankPaletteItems(items, "", ["project:alpha"])[0]?.id).toBe("project:alpha");
  });
});
