import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("session full screen", () => {
  it("promotes an expanded grid session to the immersive shell state", () => {
    const grid = fs.readFileSync(
      path.join(process.cwd(), "src/components/views/SessionGrid.tsx"),
      "utf8",
    );
    const styles = fs.readFileSync(path.join(process.cwd(), "src/styles.css"), "utf8");
    const pane = fs.readFileSync(
      path.join(process.cwd(), "src/components/views/TerminalPane.tsx"),
      "utf8",
    );
    const panel = fs.readFileSync(
      path.join(process.cwd(), "src/components/views/TerminalPanel.tsx"),
      "utf8",
    );
    const shell = fs.readFileSync(path.join(process.cwd(), "src/routes/__root.tsx"), "utf8");

    expect(grid).toContain('data-grid-session-fullscreen", fullscreenTaskId !== null');
    expect(grid).toContain("const [expandedTaskId");
    expect(grid).toContain("const [fullscreenTaskId");
    expect(shell).toContain("const sessionExpanded =");
    expect(shell).toContain("const sessionFullscreen =");
    expect(shell).toContain("!actionsActive && !sessionFullscreen && <ProjectBar");
    expect(panel).toContain('width: expanded ? undefined : width');
    expect(pane).toContain('expanded ? "Shrink session panel" : "Expand session panel"');
    expect(pane).toContain('fullscreen ? "Exit full screen" : "Full screen"');
    expect(styles).toContain("body[data-grid-session-fullscreen] .mc-topbar");
    expect(styles).toContain("body[data-grid-session-fullscreen] .mc-project-header");
    expect(styles).toContain("body[data-grid-session-fullscreen] [data-user-terminal-panel]");
  });
});
