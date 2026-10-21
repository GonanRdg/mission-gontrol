import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "mc-repository-prs-api-"));
process.env.MC_USER_DATA_DIR = root;
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("../services/_spawn", () => ({ spawnCapture: mocks.spawn }));

const { handleApiRequest } = await import("../api-router");
const { createProject } = await import("../services/projects");
const { getOrCreateApiToken } = await import("../services/settings");
const repo = path.join(root, "repo");
fs.mkdirSync(repo);
execFileSync("git", ["init", "--initial-branch=master"], { cwd: repo, stdio: "ignore" });
execFileSync("git", ["remote", "add", "origin", "git@github.com:fixture/repo.git"], { cwd: repo, stdio: "ignore" });
const project = createProject({ name: "PR picker", path: repo });

beforeEach(() => { vi.resetAllMocks(); });

function request(projectId: string) {
  return new Request(`http://127.0.0.1:5173/api/projects/${projectId}/git/pull-requests`, {
    headers: { origin: "http://127.0.0.1:5173", authorization: `Bearer ${getOrCreateApiToken()}` },
  });
}

describe("repository PR API", () => {
  it("returns a draft PR from another branch without changing the selected checkout", async () => {
    const head = fs.readFileSync(path.join(repo, ".git/HEAD"), "utf8");
    mocks.spawn.mockResolvedValue({ code: 0, stdout: JSON.stringify([[{
      number: 211, html_url: "https://github.com/fixture/repo/pull/211", title: "Inbox logging",
      draft: true, head: { ref: "HOPS-3203" },
    }]]), stderr: "" });
    const response = await handleApiRequest(request(project.id));
    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({
      repository: "https://github.com/fixture/repo",
      pullRequests: [{ number: 211, headRefName: "HOPS-3203", isDraft: true }],
    });
    expect(fs.readFileSync(path.join(repo, ".git/HEAD"), "utf8")).toBe(head);
    expect(mocks.spawn.mock.calls.map(([command]) => command)).toEqual(["gh"]);
  });

  it("returns an error response for GitHub authentication failure", async () => {
    mocks.spawn.mockResolvedValue({ code: 4, stdout: "", stderr: "private diagnostic" });
    const response = await handleApiRequest(request(project.id));
    expect(response?.status).toBe(400);
    expect((await response!.json()).error).toBeTypeOf("string");
  });

  it("rejects an unknown project without spawning a command", async () => {
    const response = await handleApiRequest(request("missing-project"));
    expect(response?.status).toBe(400);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
