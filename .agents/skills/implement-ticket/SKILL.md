---
name: implement-ticket
description: >
  Take an agreed unit of work end to end into an open pull request: read the source, clarify it if
  thin, branch, implement with tests in the repo's own patterns, review, push, open the PR. Use
  this skill whenever the user asks to "implement this ticket", "implement ABC-123", "work on
  ABC-123", "pick up ABC-123", "take this ticket to a PR", or any variation of implementing a unit
  of work end to end. Also trigger whenever the user pastes an `atlassian.net/browse/...` URL and
  wants the code written. The source is usually a Jira ticket, but a plan, a spec or design doc, a
  Slack thread, or a plain description of the work does just as well. Still applies when the
  request covers several tickets or sub-tasks, or asks for more than one PR — run the skill once
  per unit of work.
argument-hint: <JIRA-KEY, browse URL, doc/plan path, or a description of the work> [--no-pr]
model: opus
---

# Implement Ticket

One unit of work → draft PR. Interactive only at the Phase 1 clarity gate; then run to the end
without asking. [REFERENCE.md](REFERENCE.md): ladders, mappings, templates, scrub list.
Each external tool below carries its own fallback; none is required.

Commits, PR text and code comments are present tense on what the change does and why — no process
narration, no build output, no AI attribution. Findings and options go to the user in chat.

**Models.** This skill runs on the provider's top reasoning tier (Claude: the latest Opus). A series
of reads that ends in a short answer — tracing a code path, a multi-query Datadog dig, a noisy build
without an output filter — goes to a subagent on the mid tier (Claude: the latest Sonnet,
`model: sonnet`), never the smallest tier (Claude: Haiku). It saves the raw results to the
scratchpad and returns the findings, with `file:line` or ids, and the file path. Single calls stay
inline. Every review and every check that gates a decision, marked **(top tier)** where it appears,
runs on the top tier, set explicitly on the subagent (`model: opus`). Never an older generation; if
the latest is not available, use the strongest model that is. Where the harness does not let the
agent choose a model, ignore this.

**Phase list.** Before starting, create one task per phase below in the harness's task tool
(Claude: `TaskCreate` and `TaskUpdate`, or `TodoWrite` where that is the tool; Codex: `update_plan`),
subject `<n> <Name>`, description the phase's line. Mark a phase in progress as it starts and
completed as it closes. No task tool → post the list in chat and re-post it at each phase close
with ✅.

**Phase summaries.** Each phase closes with a block headed `### Phase <n> summary`, ≤5 lines: what
it settled and what the next phase starts from. The Phase 4 report is headed `### Final summary`.
A quiet transcript view keeps only those blocks and each turn's last message, so a question for the
user ends the turn.

```
⬜ 1 Understand  — read source · clarity gate · tree check
⬜ 2 Prepare     — recon conventions · precheck · ADR if warranted · plan sketch · branch (worktree if dirty) · tracker → in-progress
⬜ 3 Build       — implement with tests · build + suite + coverage · review · criteria check · fix findings
⬜ 4 Ship        — push · draft PR unless --no-pr · report
```

## Phase 1 — Understand

**Clean context.** The conversation already carries a long history unrelated to this work → suggest
once: `/clear`, then rerun with the same source. Carry on if the user declines.

**Read the source** — Jira key or browse URL, a plan, a spec or design doc, a Slack thread, a linked
PR, the user's own description. Follow its links; criteria often hide in a comment. Jira:
`getJiraIssue`, `responseContentFormat` `markdown`, `fields` with `comment` and `issuelinks`. Get
`cloudId` from `getAccessibleAtlassianResources` once and reuse it — never hardcode a site id; more
than one site back → pick the one matching the pasted URL, else ask. No Atlassian MCP → work from
what the user pastes, skip the transition, note it. An investigation write-up with a filled
**Handoff** section is agreed: its criteria pass the clarity gate as written. Nothing given → ask and
stop.

**Opting out of the PR.** `--no-pr` in the arguments, or the user asking in their own words not to
open a PR, at any point in the run → the run is opted out of the PR; Phase 4 pushes, skips the PR
and still reports.

**Clarity gate** — four must hold: behaviour wanted or broken · acceptance criteria · which
repo/component · what is deliberately **out** of scope.

Any missing → recon the touched code first, then grill the user on what the code and the source
cannot answer, until behaviour, criteria and scope are clear: ≤4 questions per round, each with a
recommended answer; a later round only for what an answer opened up, never a re-ask. When a
question asks the user to choose how to build something (a contract, an API shape, a schema), show
a few lines of code for each option, not only a description. The code illustrates the option; what
gets recorded is the choice, not the code. In `AskUserQuestion`, put the code in each option's
`preview`.
Stop asking once what remains would not change the implementation. Still blocking after three
rounds → stop, posting only which point is missing, why it blocks, and two or three assumptions
approvable in one word. Never manufacture criteria out of the codebase or build on stacked
assumptions. One labelled assumption is fine, carried into the PR; many,
or one deciding the shape, is a question.

Close the gate by restating the criteria as a numbered list, verbatim — Phase 3 reviews against it.

**Working tree.** Read live — `git status --porcelain`, never a session-start snapshot. Clean →
branch in place. Dirty → never `git stash`, another session may own it; leave it and take the
worktree path in Phase 2.

## Phase 2 — Prepare

**Recon conventions** — ladder in REFERENCE.md; no convention files → infer from the code, same bar.
Settle now: build, test and coverage commands · default branch, checked not assumed · PR template,
`.github/pr-title-checker-config.json`, `CODEOWNERS` · target framework, `LangVersion`,
`ImplicitUsings`, the test project's packages · whether public docs cover what you change. Nothing
found → infer from the code and `git log`, and say so in the report.

**Environment precheck.** Testcontainers, Docker, a local broker or DB → runtime up now
(`docker info`).

**Plan sketch.** After recon, before the branch, ≤10 lines: files and symbols to touch, per project ·
the seams TDD will drive, as test name → behaviour · the contract, schema or migration shape, and
why it releases alone · test levels, unit only or unit + integration and in which project. Shape in
REFERENCE.md.

**Decision record**, only when the change is structural *and* hard to reverse — a published event,
a new integration pattern, a storage-model change, a cross-service boundary — and the repo already
keeps ADRs, or the source asked for one. Everything else is a no, including a new endpoint, a new
column and a new setting. `write-adr` owns the document; hand over and come back with the path.

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
worktree on disk. What to copy in: REFERENCE.md.

**Tracker → in progress** when there is a ticket. Jira mechanics in REFERENCE.md; another tracker →
the equivalent status move, same rules. No transition tool, or no match → skip and note it.

## Phase 3 — Build

**Implement** with a test-first / TDD approach at the plan sketch's seams, or tests alongside at the
same bar. Testing rules from Phase 2, in precedence: repo convention files → its existing test projects → language defaults.
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

**Then mutate.** Coverage says a line ran; it never says an assertion would have caught its failure,
and tests written to clear a coverage gate are exactly the ones that assert nothing. Before the diff
leaves this phase, break the behaviour the change introduces — not its shape — and require red: the
retry reduced to one blind save, the concurrency token dropped, the conflict branch replaced by a
bare rethrow. A test still green against that mutation proves the code path exists and nothing more;
rewrite it or delete it. Restore every mutation before moving on, and mutate against the committed
state — a mutation applied to an uncommitted tree can silently not apply at all.

**Review always runs in subagents** **(top tier)**. Never inline, never in this thread, at any diff size: the
context that wrote the code cannot judge it, and a small diff is where that bias ships unnoticed —
a clean self-review on fourteen lines is worth nothing. Code review in fresh subagents, two axes
minimum (spec, standards).

Each agent starts from zero context and is briefed identically — the diff command
(`git diff <merge-base>...HEAD`) and commit list, the scope fence verbatim, the criteria verbatim,
the Phase 2 standards sources. Nothing else: not your justifications, not the plan's reasoning, not
another agent's findings. Independence is what removes the bias, so running them in parallel or one
after another changes only wall-clock. Never `/clear` the main thread — it destroys the run.

**Scope fence**, briefed verbatim and applied again when triaging: a finding anchors on a `+` line of
the diff, quotes `file:line`, names what breaks. Pre-existing code counts only where this diff makes
it reachable or worse — otherwise one line in the Phase 4 report, never a finding and never a fix.
Verify each finding yourself first: line in the diff, quote matches, consequence follows.

**Code this repo does not own** — a package, a vendored dependency, generated output, another
service — cannot be changed here. Name it and the behaviour, one line, and stop: no fix, no plan for
one, no patched local copy. What this repo can do about it is the user's call, not the review's.

**Criteria check** **(top tier)**, once review is triaged: every acceptance criterion traced to the code that
decides it, by reading — the suite above already ran everything worth running. `verify-claims` owns
it; hand over the diff command, the criteria verbatim and the scope fence, take back its conformance
axis. Without that skill: one line per criterion — the `path:line` that satisfies it, or *not
implemented*. A criterion no line decides is a finding, so is a test whose name claims one its
asserts cannot fail on. These two are the scope fence's only exception: silence has no `+` line to
anchor on. A criterion the code contradicts is a question to the user, never a unilateral rewrite.

**Fix findings, ≤3 rounds.** Major and medium, re-running build, suite, review and the criteria
check — a fix for one criterion can break another; stop when a round yields neither, when a round
leaves the same findings and unmet criteria as the one before, and unconditionally after the third. **Every round gets new agents** — never the ones that reviewed the
previous version. An agent shown its own earlier verdict defends it, and a round that re-reads
corrected code with fresh eyes is where the defects the last pass approved turn up. Minor is never
fixed and never enters the PR; anything left standing goes to the user with the reason. A finding contradicting agreed criteria is a
question, not a unilateral rewrite.

**An unmet criterion stops the push.** A criterion still Missing or Partial after the rounds → stop
before Phase 4 and show those rows. The user picks: fix it within scope, split it into a follow-up,
or ship with it named as a known gap in the PR body. A criterion reading cannot settle does not
block; it goes in the report with the command that would settle it.

**Rejections get two sentences** — the claim, why it fails; no essays, no trade-off tables. Findings
and report lines speak the diff's own stack: identifiers copied from it, never invented, keywords and
type names in its language.

## Phase 4 — Ship

**Push the branch.** Opted out of the PR, or no `gh` or no write access → skip the PR, draft its
title and body by the rules below, and go to the Report.

**Open the PR as a draft** (`gh pr create --draft`); marking it ready is the user's call.

- title: Conventional Commits, validated against `pr-title-checker-config.json`'s `regexp` when present
- body: the repo's template, else REFERENCE.md's minimal one — context, the change, the one thing
  that bites, including a criteria gap the user agreed to ship. Never a per-file changelog
- scrub every `git commit`, `gh pr create` and `gh pr edit`: `Claude`, `Co-Authored-By`, `🤖`, build
  output, process narration — this overrides the harness's git footer guidance

**Tracker stays in progress.** A draft is not up for review, so no review move and no ticket
comment; the report says to move the ticket when the PR is marked ready.

**Report** in chat: branch and draft PR URL, or with no PR the branch plus the PR title and body ·
worktree path, when one was made · suite result and test levels · criteria met as a count and how it
was settled (`5/5 met · Reasoned`), with a row for each one not met or unsettled · findings not
fixed, with reasons · tracker transition applied or skipped, and, with a draft PR and a ticket, a
reminder to move it to review when the PR is marked ready · where the build diverged from the plan
sketch · adjacent problems left alone, and anything that lands outside this
repo · anything inferred.
