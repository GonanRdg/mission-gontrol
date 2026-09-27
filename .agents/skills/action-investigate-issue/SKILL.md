---
name: investigate-problem
description: Find an evidenced root cause and propose a concrete fix plan.
disable-model-invocation: true
mc-action:
  title: Investigate issue
  icon: search
  accent: amber
  skill: investigate-issue
  agents: [claude-code, codex]
  worktree: true
  sources:
    - { id: jira, label: Jira ticket, widget: text, icon: file-text, placeholder: "ABC-123 or browse URL", token: jira-key }
    - { id: slack, label: Slack thread, widget: url, icon: message-square, placeholder: "https://...slack.com/archives/..." }
    - { id: datadog, label: Datadog link, widget: url, icon: activity, placeholder: "https://app.datadoghq.com/..." }
    - { id: text, label: Notes, widget: textarea, icon: search }
  sourcesMin: 1
  inputs:
    - { id: repo, label: Repository, widget: project, required: true }
  prompt: |
    /investigate-issue
    {{#sources.jira}}Jira: {{.}}{{/sources.jira}}
    {{#sources.slack}}Slack: {{.}}{{/sources.slack}}
    {{#sources.datadog}}Datadog: {{.}}{{/sources.datadog}}
    {{#sources.text}}Report: {{.}}{{/sources.text}}
    Repository: {{inputs.repo}}
    Produce an evidenced root cause and concrete fix plan. Stop at the approval gate before implementation.
    Ask for explicit confirmation before changing tracker state.
    Keep test and build results out of the PR description; report them in chat only.
    {{#worktree}}You are in an isolated worktree on throwaway branch `{{worktree.branch}}`.
    Rename it (`git branch -m <your-name>`) rather than branching again.{{/worktree}}
---

# Investigate issue action

Mission Control wrapper for `investigate-issue`.
