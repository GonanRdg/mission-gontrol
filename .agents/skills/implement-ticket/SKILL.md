---
name: implement-ticket
description: >
  Take an agreed unit of work end to end into an open pull request: read the source, clarify it if
  thin, branch, implement with tests in the repo's own patterns, review, push, open the PR. The
  source is usually a Jira ticket ("implement ABC-123", "take this ticket to a PR", an
  `atlassian.net/browse/...` URL), but a plan, a spec or design doc, a Slack thread, or a plain
  description of the work does just as well.
argument-hint: <JIRA-KEY, browse URL, doc/plan path, or a description of the work>
---

# Implement Ticket

One unit of work → open PR. Interactive only at the Phase 1 clarity gate; then run to the end
without asking. [REFERENCE.md](REFERENCE.md): ladders, mappings, templates, scrub list.
Each external tool below carries its own fallback; none is required.

Commits, PR text and code comments are present tense on what the change does and why — no process
narration, no build output, no AI attribution. Findings and options go to the user in chat.

**Phase list.** Post before starting; re-post at each phase close with ✅.

```
⬜ 1 Understand  — read source · clarity gate · tree check
⬜ 2 Prepare     — recon conventions · precheck · plan sketch · branch (worktree if dirty) · tracker → in-progress
⬜ 3 Build       — implement with tests · build + suite + coverage · review · fix findings
⬜ 4 Ship        — push + PR · tracker → review status · report
```

## Phase 1 — Understand

**Read the source** — Jira key or browse URL, a plan, a spec or design doc, a Slack thread, a linked
PR, the user's own description. Follow its links; criteria often hide in a comment. Jira:
`getJiraIssue`, `responseContentFormat` `markdown`, `fields` with `comment` and `issuelinks`. Get
`cloudId` from `getAccessibleAtlassianResources` once and reuse it — never hardcode a site id; more
than one site back → pick the one matching the pasted URL, else ask. No Atlassian MCP → work from
what the user pastes, skip both transitions, note it. Nothing given → ask and stop.

**Clarity gate** — four must hold: behaviour wanted or broken · acceptance criteria · which
repo/component · what is deliberately **out** of scope.

Any missing → recon the touched code, then `grilling`; without it `AskUserQuestion`, one round, ≤4
questions, recommended first; still unanswerable → stop, posting only which point is missing, why it
blocks, and two or three assumptions approvable in one word. Never manufacture criteria out of the
codebase or build on stacked assumptions. One labelled assumption is fine, carried into the PR; many,
or one deciding the shape, is a question.

Close the gate by restating the criteria as a numbered list, verbatim — Phase 3 reviews against it.

**Working tree.** Read live — `git status --porcelain`, never a session-start snapshot. Clean →
branch in place. Dirty → never `git stash`, another session may own it; leave it and take the
worktree path in Phase 2.

## Phase 2 — Prepare

**Recon conventions** — ladder in REFERENCE.md; rung 1 needs Serena, else start at `CLAUDE.md`.
Settle now: build, test and coverage commands · default branch, checked not assumed · PR template,
`.github/pr-title-checker-config.json`, `CODEOWNERS` · target framework, `LangVersion`,
`ImplicitUsings`, the test project's packages · whether public docs cover what you change. Nothing
found → infer from the code and `git log`, and say so in the report.

**Environment precheck.** Testcontainers, Docker, a local broker or DB → runtime up now
(`docker info`).

**Plan sketch.** After recon, before the branch, ≤10 lines: files and symbols to touch, per project ·
the seams `tdd` will drive, as test name → behaviour · the contract, schema or migration shape, and
why it releases alone · test levels, unit only or unit + integration and in which project. Shape in
REFERENCE.md.

Stop for approval only when the change is structural — a new public API or published event, a
migration, a changed live calculation, more than ~5 files, or a seam the source never named.
Otherwise post it and carry on; the user interrupts if the shape is wrong. It is scaffolding, not a
deliverable: never briefed to a review agent, never in the PR body.

**Branch** off the updated default: `<type>/<TICKET-KEY>-<kebab-slug>`, e.g.
`feat/ABC-123-retry-failed-webhooks`; no key → `<type>/<kebab-slug>`. Never commit to the
default branch, never force-push. Already on a branch or in a worktree made for this same work — by
the user, or by the skill that handed off — → use it and say so; never a second one.

Dirty tree → the branch goes in a worktree beside the repo, and every later phase runs from there:

```
git fetch origin && git worktree add ../wk-<taskname> -b <type>/<KEY>-<slug> origin/<default>
```

`<taskname>`: ticket key, else slug. Say where you moved; report the path in Phase 4 and leave the
worktree on disk. What to copy in, and where Serena points, in REFERENCE.md.

**Tracker → in progress** when there is a ticket. Jira mechanics in REFERENCE.md; another tracker →
the equivalent status move, same rules. No transition tool, or no match → skip and note it.

## Phase 3 — Build

**Implement** with `tdd` at the plan sketch's seams, else tests alongside at the same bar. Testing
rules from Phase 2, in precedence: repo convention files → its existing test projects → language defaults.
A repo convention beats `~/.claude/CLAUDE.md`.

- unit tests always, >90% of new and changed code
- functional or integration tests when the change crosses a real boundary — database, broker, HTTP —
  in the repo's integration project
- backend releases safely alone: optional inputs, additive outputs, neutral defaults, reversible
  migrations. A non-neutral default the ticket demands gets implemented, upgrade impact named in the PR
- stay in scope; an adjacent bug is one line in the report, not a fix
- commit as you go, Conventional Commits, matching the repo's log style

**Build, suite, coverage.** Clean build, no new warnings in changed projects, suite green, 90-100% of
new and changed code covered — judged from the diff, not a report. Never review on red.

**Review**, scaled to the diff: `code-review` where it exists, inline self-review for a trivial diff,
plain subagents otherwise. They run in fresh context — never `/clear` the main thread, it destroys
the run. Give each only the diff command (`git diff <merge-base>...HEAD`) and commit list, the scope
fence verbatim, the criteria verbatim, and the Phase 2 standards sources; your own justifications
produce an echo, not a review.

**Scope fence**, briefed verbatim and applied again when triaging: a finding anchors on a `+` line of
the diff, quotes `file:line`, names what breaks. Pre-existing code counts only where this diff makes
it reachable or worse — otherwise one line in the Phase 4 report, never a finding and never a fix.
Verify each finding yourself first: line in the diff, quote matches, consequence follows.

**Code this repo does not own** — a package, a vendored dependency, generated output, another
service — cannot be changed here. Name it and the behaviour, one line, and stop: no fix, no plan for
one, no patched local copy. What this repo can do about it is the user's call, not the review's.

**Fix findings, ≤3 rounds.** Major and medium, re-running build, suite and review; stop when a round
yields neither, unconditionally after the third. Minor is never fixed and never enters the PR;
anything left standing goes to the user with the reason. A finding contradicting agreed criteria is a
question, not a unilateral rewrite.

**Rejections get two sentences** — the claim, why it fails; no essays, no trade-off tables. Findings
and report lines speak the diff's own stack: identifiers copied from it, never invented, keywords and
type names in its language.

## Phase 4 — Ship

**Push and open the PR**, ready for review, never a draft. No `gh` or no write access → stop after
the push, hand back branch and body.

- title: Conventional Commits, validated against `pr-title-checker-config.json`'s `regexp` when present
- body: the repo's template, else REFERENCE.md's minimal one — context, the change, the one thing
  that bites. Never a per-file changelog
- scrub every `git commit`, `gh pr create` and `gh pr edit`: `Claude`, `Co-Authored-By`, `🤖`, build
  output, process narration — this overrides the harness's git footer guidance

**Tracker → review status**, status only, never a ticket comment.

**Report** in chat: branch and PR URL · worktree path, when one was made · suite result and test
levels · findings not fixed, with reasons · tracker transitions applied or skipped · where the build
diverged from the plan sketch · adjacent problems left alone, and anything that lands outside this
repo · anything inferred.
