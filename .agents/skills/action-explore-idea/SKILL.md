---
name: explore-idea
description: Research a question and save an evidence-backed Markdown note.
disable-model-invocation: true
mc-action:
  title: Explore idea
  icon: telescope
  accent: green
  skill: research
  agents: [claude-code, codex]
  worktree: false
  sources:
    - { id: text, label: Question or idea, widget: textarea, icon: telescope, placeholder: "What should we investigate?" }
  sourcesMin: 1
  inputs:
    - { id: repo, label: Repository, widget: project, required: true }
  prompt: |
    /research
    {{#sources.text}}Question: {{.}}{{/sources.text}}
    Repository: {{inputs.repo}}
    Use high-trust primary sources and save the findings as Markdown in this repository.
---

# Explore idea action

Mission Control wrapper for `research`.
