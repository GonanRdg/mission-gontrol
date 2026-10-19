---
name: verify-claims
description: >
  Settle whether a change does what it says and what it was asked to do — every acceptance
  criterion and every assertion traced into the code that decides it, by reading first and running
  only where reading cannot settle it. Use when a PR, stack of stacked PRs, branch or diff asserts
  something checkable — a root cause or mechanism, "this fixes X", "this test guards Y", "no
  behaviour change", a benchmark, a runbook's verification step — or when the question is
  conformance to the ticket: "does this PR do what it says", "does this match the ticket", "did
  they implement the acceptance criteria", "is the root cause right", "do these tests prove
  anything", "does this actually fix it", "second opinion on this PR", "is this safe to merge",
  "check these stacked PRs". Not for a general style or standards pass over a diff — this one
  traces every acceptance criterion and every claim to the lines that decide it.
argument-hint: <PR URL(s) or number(s), or a branch / commit range>
model: opus
---

# Verify Claims

A change is a set of claims, and a set of requirements it was given. The job is which of each
survive contact with the code.
[REFERENCE.md](REFERENCE.md): sourcing commands, the static and running form of each move, report
template, worked example, environment gotchas.

Two axes, deliberately separate:

- **Conformance** — does the code satisfy the acceptance criteria? Catches *silence*: a criterion
  nobody implemented and nobody claimed anything about.
- **Evidence** — do the change's own assertions hold? Catches *lies*: a wrong mechanism, an inert
  guard, a test that cannot fail.

A change can pass one and fail the other. Never merge or rerank findings across them: a truthful PR
that implements the wrong thing and a correct PR built on a false mechanism are different problems
with different fixes.

Three hard rules specific to this skill:

1. **Read first; run only what reading cannot settle.** Every move in Phase 4 has a reading form
   and a running form. The reading form settles most cases and works in CI, in a container, on a
   machine with no toolchain. Reach for the running form when reading is genuinely inconclusive and
   the environment allows it. A skill that only works on a developer laptop cannot run where
   reviews get automated.
2. **Never let a reasoned verdict read as a proven one.** Every verdict carries how it was reached
   — **Proven** (a command's output settled it), **Reasoned** (the control flow settled it, lines
   cited), **Unsettled** (needs a run this environment cannot do). Green tests on the head branch
   settle nothing by themselves either way. **Reasoned requires the source in hand**: a statement
   about what another service, package or job does, when its code was never opened, is Unsettled —
   inference from its database, its logs or its name is not control flow. And the evidence must
   name the same noun as the claim; a claim about a line item is not settled by a query that
   returns a quote.
3. **Findings live in the repo under review.** An external library's behaviour may *explain* a
   finding — one sentence, marked as not-ours. Never raise a finding whose fix is outside the repo.

Report style is ordinary review style and is assumed: majors and mediums only, `path:line` plus the
concrete edit on every finding, report on the artifact rather than the author, say what was settled
and how, three findings at most **per axis**. Restated here only because this skill may run
somewhere those defaults are absent.

**Models.** This skill runs on the provider's top reasoning tier (Claude: the latest Opus). A series
of reads that ends in a short answer — tracing a code path, a multi-query Datadog dig, a noisy build
without an output filter — goes to a subagent on the mid tier (Claude: the latest Sonnet,
`model: sonnet`), never the smallest tier (Claude: Haiku). It saves the raw results to the
scratchpad and returns the findings, with `file:line` or ids, and the file path. Single calls stay
inline. Every review and every check that gates a decision, marked **(top tier)** where it appears,
runs on the top tier, set explicitly on the subagent (`model: opus`). Never an older generation; if
the latest is not available, use the strongest model that is. Where the harness does not let the
agent choose a model, ignore this.

**Phase list.** Post before starting; re-post at each close with ✅.

```
⬜ 1 Collect  — fetch the change · order the stack · claim inventory · acceptance criteria
⬜ 2 Locate   — map each claim to the repo code that makes it true or false
⬜ 3 Conform  — trace every acceptance criterion into the code
⬜ 4 Settle   — falsify each claim by reading · run only where reading cannot decide
⬜ 5 Reduce   — drop what a later PR in the stack already fixed · keep live majors/mediums
⬜ 6 Report   — two axes, ≤3 findings each, one screen
```

## Phase 1 — Collect

`gh pr view --json` and `gh pr diff` per PR, diffs saved to the scratchpad (they are too big to
read inline). Given several PRs, establish the stack order from `baseRefName` — a PR based on
another PR's head branch sits on top of it. Review against the **tip** of the stack; that is what
merges.

No PR — a branch, a commit range, a pasted diff — changes only where claims come from and what
Phase 4 compares against; see "Adapting to a non-PR target" in REFERENCE.md.

**Claim inventory.** Write it down before touching code. Claims hide in more than the description:

| Source | Typical claim |
|---|---|
| Title / description | root cause, mechanism, "fixes X", rollout impact |
| Commit subjects | what each step does |
| Test method names | `..._DoesNotStopPermanently`, `..._BuildsSuccessfully` |
| Test doc comments | "regression guard for…", "reproduces the production failure" |
| Comments added by the diff | "library rejects this", "no behaviour change under…" |
| Docs / README lines added | verification steps, runbook instructions, defaults |

A claim about how a **third-party library** behaves is still the PR's claim. Check it against the
package source (REFERENCE.md), because the *repo-side* code is built on it.

**Acceptance criteria.** Source them in this order, stopping at the first that yields something:

1. The linked ticket — an issue reference in the PR body or commit subjects (`#123`, `Closes #45`,
   a Jira key, an `atlassian.net/browse/…` URL). Fetch it.
2. The PR body itself — an "Acceptance criteria" section, a requirement checklist, a bulleted
   "what this should do".
3. Ask the user where the criteria are.

If the user says there are none, skip the Conformance axis and say so in the report. Do not invent
criteria from the diff — criteria derived from the code under review cannot fail against it.

Normalise whatever you find into a numbered list of individually checkable statements. A criterion
that cannot be traced to an observable behaviour is not a criterion; mark it untestable rather than
passing it.

## Phase 2 — Locate

For each claim, find the repo code that decides it. Read the real control flow, not the diff's
framing of it: the poll loop that catches the exception, the builder that was supposed to validate,
the config the log line actually reads.

A described mechanism is falsified by finding the first link in its chain that does not hold. This
is reading, and it settles more claims than any test run does.

## Phase 3 — Conform

Every criterion from Phase 1, traced into the code at the tip of the stack. Search the whole repo,
not just the diff: a criterion already satisfied by code the change never touched is a pass, not a
gap.

Each criterion lands in exactly one verdict:

| Verdict | What it means |
|---|---|
| **Met** | code path exists and does what the criterion asks · cite `path:line` |
| **Partial** | the happy path is there, a stated condition or edge case is not |
| **Missing** | nothing in the repo implements it — the *silence* case |
| **Wrong** | implemented, but the behaviour differs from what the criterion asks |
| **Untestable** | criterion is not phrased as observable behaviour |
| **Unclaimed** | met in code, but no test asserts it — flag only when the criterion is behavioural |

Two things this axis catches that the Evidence axis structurally cannot:

- **Silence.** No claim was made about the criterion, so there is nothing to falsify.
- **Scope creep.** Behaviour in the diff that no criterion asked for. Medium at most, unless it
  changes live behaviour.

Quote the criterion verbatim on every finding. A conformance finding whose criterion is paraphrased
is unfalsifiable by the author.

## Phase 4 — Settle

Each move has a reading form and a running form. Take the reading form first; it is what makes this
skill portable. Escalate to the run only when reading leaves the claim genuinely open **and** the
environment can build. Exact commands for both forms: REFERENCE.md.

**Move A — does the new test fail on the old code?**
*Read:* diff the test against the source hunks. A test whose assertions only touch lines the change
did not alter cannot be the regression test its name claims. Follow the assertion back to the
changed line, or it does not cover the bug it names.
*Run:* check the pre-change source out over the head branch, re-run the suite. Expect failure.

Passing Move A proves the test *touches* the change. It does not prove the test depends on the
**mechanism** the change introduces, and that gap is where test theatre lives: a suite can go red
on the old code because the new API is absent, then stay green when the new code's behaviour is
gutted. So for every claim of the form "this test proves the fix works", finish with the mutation:
keep the new shape, destroy the behaviour — a retry reduced to a single blind save, a concurrency
token deleted, a conflict branch replaced by a bare rethrow — and require red. Still green means the
test asserts that the code path exists, not that it works, and the claim fails.
A coverage number never substitutes for this. Coverage proves a line executed; only a mutation
proves an assertion would have caught its failure.

**Move B — does the guard guard?**
*Read:* find the code path the guard forbids and ask whether it is reachable in the state the test
constructs. A guard that fires only at runtime cannot be exercised by a constructor test; a
condition the fixture never reaches is inert.
*Run:* reintroduce what the test forbids, re-run. Still green → inert.

**Move C — which PR in the stack does the work?**
*Read:* attribute each changed hunk to its PR, then ask which hunk each new test's assertions
depend on. A test whose path is entirely in the parent's hunks was already covered.
*Run:* check the parent's version of the shared file out over the tip branch, re-run.

When a move runs, restore every file afterwards and remove the worktree. Never work in the user's
checkout.

Anything left **Unsettled** is stated as unsettled and what would settle it — never inferred into a
pass, and never dressed up as a finding. Carry the exact command each one needs; Phase 6 offers
them back to the user.

## Phase 5 — Reduce

Stacked PRs: a defect in A that B already fixes is **history, not a finding**. Drop it. Keep only
what is still wrong at the tip. Applies to both axes — a criterion A missed and B implements is met.

Then rank each axis separately, three survivors at most each.

Keep an **Evidence** finding when it is *live* and one of:

- the stated root cause or mechanism is wrong,
- a test does not test what it claims,
- a guard does not guard,
- a doc or runbook step cannot detect the thing it says it verifies,
- a test can pass without exercising the case it exists for.

Keep a **Conformance** finding when a criterion is Missing, Wrong, or Partial in a way that changes
observable behaviour, or when scope creep changes live behaviour. Unclaimed and Untestable stay in
the verdict table and are not findings.

Drop everything that would merely be nicer.

## Phase 6 — Report

The author has to read this on a phone between meetings. **One screen.** Template in REFERENCE.md.

The shape:

- A **two-line verdict** — one line per axis, counts and the single worst thing in each. No overall
  winner; that is the reranking the separation exists to prevent.
- The **criteria table**, one row per criterion, each stated in a sentence of its own — up to about
  twenty words. Enough that a reader who has not opened the ticket knows what was asked. The
  verdict cell carries how it was settled: `Met · Reasoned`, `Partial · Proven`.
- **Findings**, `## Conformance` then `## Evidence`, numbered from 1 within each axis. Per finding:
  a heading naming the defect and how it was settled (`· Proven` or `· Reasoned` — an Unsettled
  claim is never a finding), the path on the next line, then **at most three lines of prose** —
  what the code does, what the criterion or claim needs, the concrete fix. A quoted criterion for
  conformance findings. No labelled bullet scaffolding; it doubles the length and adds nothing.
- A **one-line settlement note**: what was run, what was reasoned, what could not be settled here.

**Then, in chat — not in the PR comment — offer the unsettled runs.** The report goes to the
author, who cannot run anything; the offer goes to the user, who can. Only when something is
actually Unsettled, once, at the very end:

> Two claims are unsettled — no .NET SDK here. Want me to run them?
> ```
> A · dotnet test tests/Refunds --nologo -v n   (with Processor.cs at base) — would confirm finding 1
> B · dotnet test tests/Refunds --nologo -v n   (with the pre-PR lambda restored) — would confirm the inert guard
> ```

One command per unsettled item, each with what it would settle. If the user runs them, or says go
ahead where the environment does allow it, fold the results back in and reissue the report with
those verdicts moved to **Proven**. If they decline, the report stands as-is — unsettled stays
unsettled, and nothing gets promoted to a finding on the strength of a guess.

Where the axes agree — a criterion is Missing *and* the PR claims to have implemented it — report
once under Evidence and mark the row Missing.

Bare line refs inside prose (`:88`, `lines 144–146`); never restate the path already above the
finding. One `> [!WARNING]` at most, on the consequence that actually bites. A page of alerts reads
as none.

When an external library explains a finding, one italic clause, marked: *(that gating is the
library's, not ours — nothing to fix on their side)*. Then straight back to the repo-side edit.

## Anti-patterns

- Building and running before reading has been tried. Most claims die to the control flow.
- Reporting a reasoned verdict as if a command produced it, or the reverse.
- Requiring a toolchain the environment does not have, instead of reporting the claim unsettled.
- Closing with unsettled claims and no offer to run them.
- Deriving acceptance criteria from the diff, then reporting the diff satisfies them.
- Merging the two axes into one ranked list, or declaring a single overall verdict.
- Reporting a defect a later PR in the stack already fixed.
- "The tests pass" as evidence the fix works — Move A, in either form, or it did not happen.
- Stopping at "red on the old code" and calling a test proven. Mutate the mechanism, or the claim
  stands unsettled.
- A coverage percentage offered as evidence a test would catch a regression.
- Describing another system's internals from its data. Open its source or mark the claim unsettled.
- A finding whose fix is in someone else's package.
- Explaining a third-party mechanism at length instead of naming the repo file to change.
- Labelled bullets, sub-headings and tables where three lines of prose would do.
- Nits, praise, "overall this looks good", counts of how many files were reviewed.
- Narrating the investigation. The reader wants the verdict and the line number.
- Reviewing the user's working tree instead of the PR head.
