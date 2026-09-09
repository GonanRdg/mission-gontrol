import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ScratchPadButton menu dismissal", () => {
  it("uses capture-phase pointer dismissal so clicks anywhere outside close the menu", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/views/ScratchPadButton.tsx"),
      "utf8",
    );

    expect(source).toContain("useDismissableMenu(menuOpen");
    expect(source).not.toContain('document.addEventListener("mousedown"');
  });
});
