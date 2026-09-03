import { describe, expect, it } from "vitest";
import { renderActionPrompt } from "../action-template";

describe("renderActionPrompt", () => {
  it("interpolates values, omits empty blocks, and repeats source rows in order", () => {
    const template = `/implement-ticket
{{#sources.jira}}Ticket: {{.}}
{{/sources.jira}}{{#sources.text}}Context: {{.}}
{{/sources.text}}{{#inputs.branch}}Work on branch \`{{.}}\`.
{{/inputs.branch}}{{#options.plan}}Write an execution plan before editing.
{{/options.plan}}{{#worktree}}Worktree: {{worktree.branch}}
{{/worktree}}`;

    expect(
      renderActionPrompt(template, {
        sources: {
          jira: ["MC-123", "https://example.test/browse/MC-456"],
          text: [],
        },
        inputs: { branch: "feat/actions" },
        options: { plan: true },
        worktree: { branch: "generated-on-start" },
      }),
    ).toBe(`/implement-ticket
Ticket: MC-123
Ticket: https://example.test/browse/MC-456
Work on branch \`feat/actions\`.
Write an execution plan before editing.
Worktree: generated-on-start
`);
  });

  it("renders false and missing values as empty strings", () => {
    expect(
      renderActionPrompt("{{missing}}|{{options.pr}}|{{#options.pr}}open{{/options.pr}}", {
        options: { pr: false },
      }),
    ).toBe("||");
  });

  it("rejects malformed or expression-like templates", () => {
    expect(() => renderActionPrompt("{{#source}}missing close", {})).toThrow(
      'unclosed block "source"',
    );
    expect(() => renderActionPrompt("{{uppercase title}}", { title: "x" })).toThrow(
      'invalid template path "uppercase title"',
    );
  });
});
