import { expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("electron-log/main", () => ({ default: { warn: vi.fn() } }));
import { installAgentMemoryBrief } from "../agent-memory-brief";

it("strips legacy injected Recall context without a running API, preserving user notes", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "mg-brief-retirement-"));
  const file = join(cwd, "CLAUDE.local.md");
  writeFileSync(file, "User notes\n\n<!-- mc:recall:start (managed by Mission Control — do not edit inside these markers) -->\nStale context\n<!-- mc:recall:end -->\n");
  await installAgentMemoryBrief({ agent: "claude-code", cwd, taskId: "", mcEnv: null });
  expect(readFileSync(file, "utf8").trim()).toBe("User notes");
});
