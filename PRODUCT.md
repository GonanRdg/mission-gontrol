# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo developers and technical power users running multiple coding agents across many repositories.
They work in long, keyboard-first sessions with frequent context switches.

## Product Purpose

Mission Control is a local-first Electron desktop control surface for running and monitoring parallel
coding agents. It makes attention visible across projects and sessions while keeping terminals and
active work primary.

## Positioning

An operator cockpit for parallel coding agents, not another IDE. It coordinates installed agent CLIs,
repositories, worktrees, Git actions, and persistent terminals in one local desktop app.

## Brand Personality

Calm, precise, operator-grade. A cockpit, not dashboard marketing. Confidence through restraint:
terminals are the content and chrome stays quiet.

## Design Principles

1. **Terminals are the content** — chrome recedes around active work.
2. **State is always legible** — running, needs-input, done, and error states never rely on color alone.
3. **Feedback on every interaction** — actions acknowledge input and expose failure clearly.
4. **Density with rhythm** — use spacing and tonal steps before extra boxes.
5. **Consistent vocabulary** — controls behave consistently across themes and workflows.

## Accessibility & Inclusion

- Body and label text must meet WCAG AA contrast; state indicators and large text must meet 3:1.
- Every interactive control needs a visible focus state and full keyboard operation.
- Respect `prefers-reduced-motion`.
- Do not encode status through color alone.
- Avoid layout-dependent punctuation in default shortcuts so Spanish keyboards remain usable.
