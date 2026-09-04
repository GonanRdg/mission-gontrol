---
name: implement-feature
description: Build a feature or complete a tracked ticket.
disable-model-invocation: true
mc-action:
  title: Implement ticket
  icon: code
  accent: blue
  skill: implement-ticket
  agents: [claude-code, codex]
  worktree: true
  sources:
    - { id: jira, label: Jira ticket, widget: text, icon: file-text, placeholder: "ABC-123 or browse URL", token: jira-key }
    - { id: slack, label: Slack thread, widget: url, icon: message-square, placeholder: "https://...slack.com/archives/..." }
    - { id: github, label: GitHub PR or issue, widget: url, icon: git-branch, placeholder: "https://github.com/...", token: pr-number }
    - { id: file, label: File or plan, widget: path, icon: folder }
    - { id: text, label: Notes or pasted spec, widget: textarea, icon: search }
  sourcesMin: 1
  inputs:
    - { id: repo, label: Repository, widget: project, required: true }
    - { id: branch, label: Branch hint, widget: branch, help: "Optional. The workflow chooses the final branch." }
  prompt: |
    /implement-ticket
    {{#sources.jira}}Ticket: {{.}}{{/sources.jira}}
    {{#sources.slack}}Slack: {{.}}{{/sources.slack}}
    {{#sources.github}}GitHub: {{.}}{{/sources.github}}
    {{#sources.file}}File: {{.}}{{/sources.file}}
    {{#sources.text}}Context: {{.}}{{/sources.text}}
    Repository: {{inputs.repo}}
    {{#inputs.branch}}Branch hint: {{.}}{{/inputs.branch}}
    Ask for explicit confirmation before changing tracker state.
    Keep test and build results out of the PR description; report them in chat only.
    {{#worktree}}You are in a fresh worktree on throwaway branch `{{worktree.branch}}`.
    Rename it (`git branch -m <your-name>`) rather than branching again.{{/worktree}}
---

# Implement ticket action

Mission Control wrapper for `implement-ticket`.
