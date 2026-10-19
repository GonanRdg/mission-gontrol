---
name: investigate-issue
description: >
  Investigate a reported issue from whatever context exists — a Jira ticket, a Slack thread, a
  Datadog link, a pasted customer complaint, or any combination — and produce an evidenced root
  cause plus a concrete fix plan, then implement it only after the user approves. Use this skill
  when the user says "investigate this", "investigate this bug", "investigate this issue", "look
  into this", "what is causing this", "find the root cause", "RCA this", or pastes a Jira ticket
  URL, a slack.com/archives thread link, or an app.datadoghq.com link and wants to know what is
  wrong before any code is written. Prefer this over jumping straight to implement-ticket whenever
  the cause is not yet known.
argument-hint: <Jira key/URL and/or Slack thread URL and/or Datadog URL and/or pasted report> [--no-pr]
model: opus
---

# Investigate Issue

Reported problem → **evidenced root cause** → **approved plan** → shipped fix.
[REFERENCE.md](REFERENCE.md): tool fallbacks, link parsing, Datadog map, repo resolution,
worktrees, write-up template, redaction list, anti-patterns. One thing is required — a source to
read. Code comes from the open repo, a path the user gives, or — for a service the evidence names —
a sibling of the open repo or `gh` read-only (REFERENCE.md §4). Never searched for, never cloned
unprompted, never guessed. An infra, DB or data issue runs on telemetry and read-only queries
alone. Every other tool degrades, per REFERENCE.md.

Three hard rules:

1. **Phases 1–3 write nothing but the write-up file and throwaway repro harnesses.** No production
   code, no config, no monitors, no Jira comments, nothing to Slack. Reading is open: query
   Datadog through its MCP tools and query the DB read-only through whatever access is set up — a
   DB skill, a CLI, an MCP server — without asking first.
2. **Every write-up claim cites evidence** — `file:line`, a query and its result, a log line, a
   commit sha, a Slack message. Uncited → labelled a hypothesis.
3. **Phase 4 needs an explicit go.** Not "sounds right", not silence.

Commits, PR text and code comments are present tense on what the change does and why — no process
narration, no build output, no AI attribution. Findings and options go to the user in chat and to
the write-up.

**Explaining rule**, every chat summary and report: lead with the mechanism in one plain sentence —
what the code does, why that breaks — then evidence.

- Root cause ≤3 sentences, chat ≤30 lines of prose, a ceiling not a target. Tables, fenced code and
  diagrams do not count against it. Overflow belongs in the write-up. The mechanism will not fit →
  it is not understood yet; compress, do not expand.
- Markdown, always: headings, bold, tables, fenced blocks. No terminal-only formatting — the answer
  gets pasted somewhere else.
- Diagram when the *shape* is the finding: two things confused, data flowing where it should not, a
  check at the wrong point in a path. Small; Mermaid where the reader renders it, ASCII otherwise.
  Skip it for a wrong value or a missing guard. When the fix moves that structure, the same sketch
  goes in the PR body.
- The reporter's noun before the class name. One idea per sentence. No qualifier paragraphs.
- User asks what something means → the explanation failed. Rewrite shorter, do not add.

**One canonical summary.** The chat summary is a single self-contained block — the reader never
composes an answer from three earlier messages.

- A fact inside it changed (new evidence, cause corrected, blast radius moved) → rewrite the whole
  block and post it again, complete. Never post a delta that only makes sense against an older
  message.
- Nothing in it changed → answer only what was asked, ≤5 lines, and point at the write-up path.
  Reposting an unchanged summary is waste.
- A stated cause is falsified → the correction is two lines at the top, then the rewritten block.
  No retrospective on how the wrong theory was reached.
- Asked for the message in a specific shape (Slack, ticket comment, channel post) → that shape *is*
  the block, produced once. Do not emit a long version first and compress on request.

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
completed as it closes; Phase 4 closes when implement-ticket takes over. No task tool → post the
list in chat and re-post it at each phase close with ✅.

```
⬜ 1 Context     — parse links · read Jira/Slack/Datadog · pick working dir · restate the report
⬜ 2 Investigate — dup check · evidence chain · repro or trace · confirmed cause (hypotheses if open)
⬜ 3 Propose     — root cause · options · plan · tests · risk → write-up file + chat summary
⬜ 4 Ship        — on explicit go only: implement-ticket, else implement → review → push → draft PR unless --no-pr
```

## Phase 1 — Context

**Parse whatever was given**, any mix, any order; shapes and tools in REFERENCE.md. One of a Jira
key, a Slack thread URL, a Datadog URL or a pasted report is enough — the CS case is a ticket alone,
the on-call case a Datadog link alone. Nothing parseable → ask and stop.

**Opting out of the PR.** `--no-pr` in the arguments, or the user asking in their own words not to
open a PR, at any point in the run → the run is opted out of the PR; Phase 4 pushes, skips the PR
and still reports.

**Read every source before forming a theory.**

- **Jira** — `getJiraIssue`, `responseContentFormat` `markdown`, `fields` with `comment`,
  `issuelinks`, `attachment`. `cloudId` from `getAccessibleAtlassianResources` once, reused — never
  hardcoded; several sites → match the pasted host, else ask. Repro steps hide in a comment.
- **Slack** — `slack_read_thread` on channel + ts, whole thread: the account id, the entity id, "it
  started Tuesday" is a reply, not the opener. Screenshots and dumps via `slack_read_file`.
- **Datadog** — skill discovery first, then query. **Never `WebFetch` a Datadog URL**; it needs a
  session. Re-run the URL's params through the MCP tools.

**Pull out the identifiers** in chat — account/tenant id, the domain entity ids the report names,
request/trace id, correlation id, message key, verbatim error, service, env, and **when it started**.
A missing "when" is worth one question: it decides every time range.

**Pick the working directory** — the repo that is open, or a path the user gives. The Datadog
`service:` tag, stack-trace namespaces, the Jira component and names said in the thread decide
whether the open repo is the right one (signals in REFERENCE.md), never where to go looking.

- Current repo matches → use it, say which, do not ask.
- Mismatch, or no repo open → reach the named service's code as in REFERENCE.md §4: a sibling of
  the open repo, else `gh` read-only, else ask for its path. Carry on with telemetry meanwhile.
- Cross-repo → **one primary**, named read-only secondaries.

Evidence later points elsewhere → say so and re-post the phase list. Never quietly switch repos.

**Restate the report** in three or four lines: symptom · who is affected · blast radius · since
when · what you were given. Sources contradicting each other is a finding — surface it now.

## Phase 2 — Investigate

**Check it is not already known.** `git log --oneline -30` plus `git log -L <lines>:<file>` or
`git log -S"<symbol>"` on the suspect area must run: it answers regression-or-always-broken and
dates the code. Blame settles it → say what it showed, move on. Still open, or the symptom sounds
filed already → `searchJiraIssuesUsingJql` with `text ~` on the error and the feature,
`gh pr list --search "<term>" --state all` for a fix merged but undeployed, and `get_change_stories`
plus DORA events to correlate first-seen against releases. Already fixed or tracked → report and
stop; no plan for solved work.

**Trace code in a subagent.** Mapping a code path across many files — callers, handlers, the config
it reads — is a series of reads (see Models): brief it with the question, take back the path as
`file:line` steps. What the path means is decided here.

**Then name your lane.**

**Lane A — reproducible.** Diagnose it properly, TDD-style: red-capable loop *before*
theorising, minimise, rank, one variable at a time. That failing test becomes Phase 4's regression
test.

**Lane B — production-only** (data-dependent, tenant-specific, timing, third-party). Evidence chain,
ordered in time:

1. Bound the window from the **first** occurrence, not from now. The report's own ids returning
   nothing is retention, not absence — say so, retry once on archive/flex, then tie report to
   evidence by mechanism plus a stable id (same account, same error, same path). Never present a
   pattern match as the exact request, never let "no logs found" read as "not real".
2. One **complete** failing case — trace, its logs, then the payload. `get_datadog_trace` on a single
   id finds causes; aggregates only size the blast radius.
3. Contrast a **succeeding** case. The diff is usually the bug.
4. Count the blast radius: accounts, events, rate, ongoing or not.
5. Walk the code with the trace in hand, pin the line where behaviour diverges, and if a seam exists
   write a **failing unit test** from the captured payload — Lane B becomes Lane A, cause proved.

**No resource cause without its limit.** Any cause of the form "ran out of X" / "X exhausted" /
"X saturated" — pool, connections, threads, memory, CPU, disk, quota, rate budget, file handles —
needs the measured value **and** the ceiling it was measured against, in the same sentence. One
number alone proves nothing: 372 connections is 19% of a 2000 cap. No ceiling available, or the
metric is missing → it is a hypothesis, labelled, and the falsifier is named. This applies only when
saturation is actually the claim; a wrong value, a bad branch or a missing guard needs no such
numbers.

**Lane C — the state you cannot see.** The divergence sits in data or in a system this repo only
talks to (database, cache, queue, third-party API), and code reading alone cannot settle it. Do not
conclude on that system's behaviour from application telemetry — get the fact:

- **First ask whether you can read it.** Another Lodgify service is not a black box: when its
  behaviour decides the cause, read its source the same way (REFERENCE.md §4) — never search for it.
  Its publisher, its mapper and its repository methods settle in minutes what a week of its database
  will not — which sites publish, what the payload carries, which loads are eager. A statement about
  what another service *does* is a hypothesis until its source is open; its rows, its logs and its
  name are not control flow. Discovering the repo was readable all along invalidates everything
  inferred before it.

- DB access available → query the DB **read-only**, and prefer
  the cheap structural facts first: the table's indexes, the plan for the hot query
  (`EXPLAIN (ANALYZE, BUFFERS)`), row counts, engine settings. A missing index or a seq scan shows up
  in two commands and outranks any amount of inference.
- Whether a tool exists is a one-look check — the skill list, the MCP tools already loaded. Use
  access as it is configured, credentials included; no hunting for access that is not set up, no
  retrying dead connections.
- No access → ask the user to run it, and make the ask executable: exact queries when the schema is
  known well enough to write them, otherwise the specific fact needed and **why it decides** — "is
  there an index on `Websites.Slug`? if not, that is the cause; if there is, the cause is elsewhere".
  One round, batched, read-only only.
- Answer not back yet → carry on with everything that does not depend on it, and label the branch
  that does as unproven.

**Hypotheses only while the cause is open.** One pass landing on a specific line that explains every
symptom → confirmed, cite it, move on; no ranked list. Two or more mechanisms still standing → post
three to five, ranked, each falsifiable ("if X, then Y makes it disappear") before testing them. Do
not block on a reply; proceed with your ranking.

**Confirmed means** a specific input plus a specific line explains every piece of evidence,
including why it did not happen before. The line must sit in the system whose behaviour the claim
describes — a line in this repo does not confirm a claim about what another service publishes.
Otherwise: "best hypothesis, N% confidence", plus what would confirm it. Never dress one up as the
other.

**Ruling a hypothesis out costs the same as ruling one in.** A sample too small to have shown the
effect refutes nothing, and neither does a query whose columns name something other than the claim —
a claim about a line item is not settled by a timestamp on a quote. State the sample and the
strength when you discard a mechanism, or keep it open.

**Have the mechanism checked before Phase 3 closes** **(top tier)**. Once the cause is written down, hand it to a
subagent with zero context: the evidence, the claim, and the instruction to falsify it — not your
reasoning for it. This is the cheapest control there is and it is independent of how sure you feel,
which is the whole point. Its verdict lands in the write-up before anyone reads it.

## Phase 3 — Propose

**Enter Phase 3 only once Phase 2 has exited** — cause confirmed, or every open hypothesis has its
falsifier named and the cheap checks (Lane C's structural facts, the resource ceilings) already run.
A write-up produced before those is a draft that gets rewritten, and the wrong version is the one the
reader remembers.

**Write the write-up file** — template and location ladder in REFERENCE.md. Default is **outside the
repo**, at a path that survives `/clear` and the end of the session. It exists so the
investigation survives a lost context window and so a later "give me the full detail" is answered
from a file rather than reconstructed. In-repo (`docs/investigations/…`) only when the repo already
keeps investigations in tree, and never committed onto a fix branch before the mechanism has
survived the independent check — a refuted write-up in a PR is corrected in public, three times,
and then deleted. Say the path once. **Redact first**: names, emails, addresses,
phone numbers, card data, tokens, auth headers. Ids stay — list in REFERENCE.md.

**Summarise in chat**, ≤30 lines, this block with these labels, in this order — everything else
stays in the file:

```markdown
**Cause** (confirmed | hypothesis N%): <mechanism, plain words, ≤3 sentences> — `file:line`
**Affected**: <blast radius in one line — how many, since when, still happening or not>
**Fixes**:
1. <recommended fix, one line> — <why> · `<repo it lands in>`
2. <alternative> — <trade-off>
**Bites**: <upgrade / deploy / data already broken>
**Open**:
1. <question> → settled by <query / person> · changes <fix | scope | data repair>
**Next**: Implement the fix? · write-up: `<path>`
```

- **Bites** and **Open** are dropped when empty.
- **Affected** is the summary; per-account lists, breakdowns and the queries behind them stay in
  the write-up until asked for.
- **Fixes**: 1–3, recommended first, one line each — the same options as the write-up. A rejected
  alternative earns a line only when the user would otherwise propose it.
- **Open**: at most 3, medium to critical only — a question whose answer changes the fix, the scope
  or the data repair. Lower goes to the write-up or nowhere.
- A question a query can answer is not open: run the query (see Lane C) and put the answer in the
  block.
- Not for a follow-up where nothing changed, a handoff block, or a shape the user asked for.

Ruled-out hypotheses, the full plan, the test list, out-of-scope: file only. Naming them here is what
turns a summary into a wall.

**Cause outside this repo** — another service, a package, a vendored dependency, a managed
platform: say so in the same line as the cause, naming the repo, package or service and its version.
The fix lands where the defect is, never as a patch in the repo the investigation started from: no
call-site guard, no workaround, no config shim here unless the user asks for one.

- The user opens the skill in the owning repo, or gives its path → it becomes the primary: say so,
  re-post the phase list, and plan the fix there. Phase 4 runs from that repo. Code read through
  `gh` is enough to diagnose; a fix needs a checkout — ask to open the skill there, or to clone it
  on the user's go.
- Otherwise stop at the location: the service, host or resource the traces point at, with the
  evidence. No code search, no plan for code nobody has opened; the user brings the repo or not.
- Telemetry does not locate it → say so, list what would (a trace id, a log query, access to a
  system), and stop. No blind search.
- A package with a fixed release → upgrading or pinning to it is the fix, and it lands here.
- Owned by someone else → the deliverable is a **handoff block**.

The handoff block is paste-ready Markdown, written for a reader with none of this context and
produced without being asked twice: who owns it · the impact in numbers · the mechanism in one
sentence · one query or link that shows it · the specific ask. Ten lines. The write-up is what it
links to for detail.

**Then stop and wait.** The plan may be wrong in a way only the user can see. Do not gate in the same
message that first teaches a model the reader has not seen — send the explanation as text, let them
answer in words, gate the turn after; a picker offers no way to say "I do not follow". When you do
use `AskUserQuestion`, carry an option that sends it back for a clearer explanation.

## Phase 4 — Ship (only on an explicit go)

Nothing here starts on its own — not the handoff, not a branch. The user approving the fix and
saying to implement it is the go; agreeing with the diagnosis is not.

**Fill the Handoff section of the write-up first** — the approved fix, the criteria, the scope, the
repo. After a long investigation, suggest a clean context before building: `/clear`, then
`/implement-ticket <write-up path>`, plus `--no-pr` when the run opted out of the PR; continue in this
session only if the user says so.

**Pick the path before touching the tree.** Exactly one skill checks the tree and creates the
branch — whichever one is about to write code.

**Preferred, once the user has said go: hand to `implement-ticket`** whenever it exists. It takes any source of intent, so the
approved plan alone qualifies — no ticket required. Pass **the plan as the agreed acceptance
criteria**, with whatever the report came from beside it (ticket key, Slack thread, Datadog link, the
write-up path), so it skips its own clarity gate. Opted out of the PR → pass `--no-pr` on. It runs from
the repo the fix lands in. It owns the tree check, the branch, the worktree, conventions, coverage,
review scaling, the PR body and the ticket transitions. So touch nothing first: no `git status`,
no branch, no worktree — say the tree is dirty if it is, and let it decide.
Then stop; the steps below are not run on top of a handoff.

No ticket costs only the key in the branch and PR title, and the status transitions. Offer to create
one; a declined ticket does not block the handoff, but the go still has to come first.

**Fallback path**, when `implement-ticket` is unavailable. This skill then owns the tree check, the
branch and the worktree:

1. Recon conventions — build, test and coverage commands, default branch checked not assumed, PR
   template, title checker regex, `CODEOWNERS`. Ladder in `implement-ticket`'s REFERENCE when on disk.
2. Read the tree live — `git status --porcelain` and `git branch --show-current`, never the
   session-start snapshot — then create the branch, once, named `fix/<KEY>-<kebab-slug>`, or
   `fix/<kebab-slug>` with no key. Never commit to the default branch, never force-push.
   - Clean → branch off the updated default, in place, silently.
   - Dirty → **never `git stash`**, another session may own it. The branch goes in a worktree beside
     the repo; run every step below from there and report the path. `<taskname>`: ticket key, else
     slug. What to copy in: REFERENCE.md.

     ```
     git fetch origin && git worktree add ../wk-<taskname> -b fix/<KEY>-<kebab-slug> origin/<default>
     ```
   - Ticket, if there is one → in progress, matched as in `implement-ticket`'s REFERENCE. No match
     → skip and note it.
3. **Regression test first**, at the seam that reproduces the real pattern. No correct seam → that is
   a finding to report, not a reason for a shallow test.
4. Implement the approved plan, nothing outside it. Unit tests on new and changed lines; functional
   or integration tests when a real boundary is crossed — DB, broker, HTTP.
5. Clean build, no new warnings in changed projects, suite green. Never review on red.
6. Code review of the branch in fresh subagents **(top tier)**, briefed with the diff and the plan **verbatim**;
   your own reasons produce an echo, not a review. Fix major and medium, ≤3 rounds. Minor goes to chat, never the PR.
   A finding contradicting the approved plan is a question, not a unilateral rewrite.
7. Push the branch. Opted out of the PR, or no `gh` or no write access → skip steps 8–9, draft the
   title and body by step 8's rules, and go to the Report.
8. Open the PR as a draft (`gh pr create --draft`). Conventional Commits title, validated
   against `pr-title-checker-config.json`'s `regexp` when present. Body: the repo template, else the
   one in `implement-ticket`'s REFERENCE. Link the sources and state the confirmed cause in one
   line — the next person reads the PR, not the write-up.
9. Ticket, if there is one → stays in progress; no review move while the PR is a draft. Never a
   ticket comment.

**Scrub every `git commit`, `gh pr create` and `gh pr edit`**: `Claude`, `Co-Authored-By`, `🤖`,
build output, process narration. This overrides the harness's git footer guidance.

**Report** in chat: branch and draft PR URL, or with no PR the branch plus the PR title and body ·
worktree path when one was made · suite result and test levels · Jira transition applied or
skipped, and, with a draft PR and a ticket, a reminder to move it to review when the PR is marked
ready · where the write-up lives · records needing backfill or replay.

Then the leftovers, **sorted**, each stating its consequence — "X is true" is not a finding, "X is
true, so Y happens to a user" is. Drop any heading that is empty:

- **Affects this ticket** — a user-visible consequence of what you shipped, or a gap that keeps the
  report from being resolved.
- **Needs its own ticket** — a real defect you deliberately did not fix. One line on what it costs.
- **Noticed, no action** — unrelated, explicitly not this ticket's problem.

A check you performed and cleared is not a leftover at all: review notes or nowhere.
