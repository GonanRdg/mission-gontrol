---
name: review-code
description: Review current changes against repository standards and a fixed point.
disable-model-invocation: true
mc-action:
  title: Review code
  icon: git-pull-request
  accent: purple
  skill: code-review
  agents: [claude-code, codex]
  worktree: true
  inputs:
    - { id: repo, label: Repository, widget: project, required: true }
    - { id: base, label: Base ref, widget: text, required: true, placeholder: "main", help: "Commit, branch, tag, or merge base to review against." }
  prompt: |
    /code-review
    Review {{inputs.repo}} against fixed point `{{inputs.base}}`.
    {{#worktree}}This review runs in isolated worktree `{{worktree.branch}}`.{{/worktree}}
---

# Review code action

Mission Control wrapper for `code-review`.
