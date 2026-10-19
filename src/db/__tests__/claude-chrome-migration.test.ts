import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";

describe("Claude Chrome migration", () => {
  it("preserves existing projects and sessions with neutral Chrome defaults", () => {
    const db = new Database(":memory:");
    try {
      db.exec("CREATE TABLE projects (id TEXT, saved_skip_permissions INTEGER); CREATE TABLE tasks (id TEXT, claude_skip_permissions INTEGER);");
      db.exec("INSERT INTO projects VALUES ('p1', 1); INSERT INTO tasks VALUES ('t1', 0);");
      db.exec(readFileSync(new URL("../migrations/0026_claude_chrome.sql", import.meta.url), "utf8"));
      expect(db.prepare("SELECT * FROM projects").get()).toEqual({ id: "p1", saved_skip_permissions: 1, saved_claude_chrome: null });
      expect(db.prepare("SELECT * FROM tasks").get()).toEqual({ id: "t1", claude_skip_permissions: 0, claude_chrome: null });
    } finally {
      db.close();
    }
  });
});
