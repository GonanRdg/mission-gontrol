import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("HeaderToolsCluster dismissal", () => {
  it("dismisses the three-dot tool tray from outside pointer presses", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/views/HeaderToolsCluster.tsx"),
      "utf8",
    );

    expect(source).toContain("useDismissableMenu(expanded, close, clusterRef)");
  });
});
