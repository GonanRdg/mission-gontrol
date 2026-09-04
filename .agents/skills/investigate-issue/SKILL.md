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
argument-hint: <Jira key/URL and/or Slack thread URL and/or Datadog URL and/or pasted report>
---

# Investigate Issue

Reported problem → **evidenced root cause** → **approved plan** → shipped fix.
[REFERENCE.md](REFERENCE.md): tool fallbacks, link parsing, Datadog map, repo resolution,
worktrees, write-up template, redaction list, anti-patterns. Only two things are required — one
source to read, and a checkout of the service that owns the code path; either missing → stop in
Phase 1, and never clone on your own. Every other tool degrades, per REFERENCE.md.

Three hard rules:

1. **Phases 1–3 write nothing but the write-up file and throwaway repro harnesses.** No production
   code, no config, no monitors, no Jira comments, nothing to Slack.
2. **Every write-up claim cites evidence** — `file:line`, a query and its result, a log line, a
   commit sha, a Slack message. Uncited → labelled a hypothesis.
3. **Phase 4 needs an explicit go.** Not "sounds right", not silence.

Commits, PR text and code comments are present tense on what the change does and why — no process
narration, no build output, no AI attribution. Findings and options go to the user in chat and to
the write-up.

**Explaining rule**, every chat summary and report: lead with the mechanism in one plain sentence —
what the code does, why that breaks — then evidence.

- Root cause ≤3 sentences, chat ≤30 lines, a ceiling not a target. Overflow belongs in the write-up.
  The mechanism will not fit → it is not understood yet; compress, do not expand.
- Diagram when the *shape* is the finding: two things confused, data flowing where it should not, a
  check at the wrong point in a path. ASCII, small. Skip it for a wrong value or a missing guard.
  When the fix moves that structure, the same sketch goes in the PR body.
- The reporter's noun before the class name. One idea per sentence. No qualifier paragraphs.
- User asks what something means → the explanation failed. Rewrite shorter, do not add.

**Phase list.** Post before starting; re-post at each phase close with ✅.

```
⬜ 1 Context     — parse links · read Jira/Slack/Datadog · pick working dir · restate the report
⬜ 2 Investigate — dup check · evidence chain · repro or trace · confirmed cause (hypotheses if open)
⬜ 3 Propose     — root cause · options · plan · tests · risk → write-up file + chat summary
⬜ 4 Ship        — on explicit go only: implement-ticket, else implement → code-review → PR
```

## Phase 1 — Context

**Parse whatever was given**, any mix, any order; shapes and tools in REFERENCE.md. One of a Jira
key, a Slack thread URL, a Datadog URL or a pasted report is enough — the CS case is a ticket alone,
the on-call case a Datadog link alone. Nothing parseable → ask and stop.

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

**Pick the working directory** — a decision, not an assumption. `git rev-parse --show-toplevel`,
then candidates from the Datadog `service:` tag, stack-trace namespaces, Jira component, names said
in the thread; resolve them against disk (heuristics in REFERENCE.md).

- Current repo matches → use it, say which, do not ask.
- Mismatch, several candidates, or none → `AskUserQuestion`, one round: the directories actually
  found, the current one, "other".
- Candidate not on disk → say so and ask.
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

**Then name your lane.**

**Lane A — reproducible.** `diagnosing-bugs`, followed properly: red-capable loop *before*
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

**Hypotheses only while the cause is open.** One pass landing on a specific line that explains every
symptom → confirmed, cite it, move on; no ranked list. Two or more mechanisms still standing → post
three to five, ranked, each falsifiable ("if X, then Y makes it disappear") before testing them. Do
not block on a reply; proceed with your ranking.

**Confirmed means** a specific input plus a specific line explains every piece of evidence,
including why it did not happen before. Otherwise: "best hypothesis, N% confidence", plus what would
confirm it. Never dress one up as the other.

## Phase 3 — Propose

**Write the write-up file** — template and location ladder in REFERENCE.md; default
`docs/investigations/<KEY-or-slug>.md`, else the scratchpad, saying which and offering to move it.
It exists so the investigation survives a lost context window, and stays out of the fix commit
unless the repo already keeps investigations in tree. **Redact first**: names, emails, addresses,
phone numbers, card data, tokens, auth headers. Ids stay — list in REFERENCE.md.

**Summarise in chat**, ≤30 lines, in order — everything else stays in the file:

1. Root cause, ≤3 sentences, plain words first, then `file:line`
2. Blast radius — the number, and the query it came from
3. Recommended fix in one line, plus the one rejected alternative and why
4. The one thing that bites — upgrade, deploy, or data already broken
5. The gate question

Confidence, ruled-out hypotheses, the full plan, the test list, out-of-scope: file only. Naming them
here is what turns a summary into a wall.

**Cause outside this repo** — a package, a vendored dependency, another team's service, a managed
platform: say so in the same line as the cause, with the package or service and version, and stop
there. Options stay inside what this repo controls: pin or upgrade, guard the call site, change
config, raise it upstream. Never a plan to edit source the repo does not own.

**Then stop and wait.** The plan may be wrong in a way only the user can see. Do not gate in the same
message that first teaches a model the reader has not seen — send the explanation as text, let them
answer in words, gate the turn after; a picker offers no way to say "I do not follow". When you do
use `AskUserQuestion`, carry an option that sends it back for a clearer explanation.

## Phase 4 — Ship (only on an explicit go)

**Pick the path before touching the tree.** Exactly one skill checks the tree and creates the
branch — whichever one is about to write code.

**Preferred: hand to `implement-ticket`** whenever it exists. It takes any source of intent, so the
approved plan alone qualifies — no ticket required. Pass **the plan as the agreed acceptance
criteria**, with whatever the report came from beside it (ticket key, Slack thread, Datadog link, the
write-up path), so it skips its own clarity gate. It owns the tree check, the branch, the worktree,
conventions, coverage, review scaling, the PR body and the ticket transitions. So touch nothing
first: no `git status`, no branch, no worktree — say the tree is dirty if it is, and let it decide.
Then stop; the steps below are not run on top of a handoff.

No ticket costs only the key in the branch and PR title, and the status transitions. Offer to create
one — and hand off either way when the user declines.

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
     slug. What to copy in, and where Serena points, in REFERENCE.md.

     ```
     git fetch origin && git worktree add ../wk-<taskname> -b fix/<KEY>-<kebab-slug> origin/<default>
     ```
3. **Regression test first**, at the seam that reproduces the real pattern. No correct seam → that is
   a finding to report, not a reason for a shallow test.
4. Implement the approved plan, nothing outside it. Unit tests on new and changed lines; functional
   or integration tests when a real boundary is crossed — DB, broker, HTTP.
5. Clean build, no new warnings in changed projects, suite green. Never review on red.
6. `code-review` on the branch, briefed with the diff and the plan **verbatim** — your own reasons
   produce an echo, not a review. Fix major and medium, ≤3 rounds. Minor goes to chat, never the PR.
   A finding contradicting the approved plan is a question, not a unilateral rewrite.
7. Push and open the PR, ready for review, never a draft. Conventional Commits title, validated
   against `pr-title-checker-config.json`'s `regexp` when present. Body: the repo template, else the
   one in `implement-ticket`'s REFERENCE. Link the sources and state the confirmed cause in one
   line — the next person reads the PR, not the write-up.
8. Ticket, if there is one → transition it to the review status. Status only, never a comment.

**Scrub every `git commit`, `gh pr create` and `gh pr edit`**: `Claude`, `Co-Authored-By`, `🤖`,
build output, process narration. This overrides the harness's git footer guidance.

**Report** in chat: branch and PR URL · worktree path when one was made · suite result and test
levels · Jira transitions applied or skipped · where the write-up lives · records needing backfill
or replay.

Then the leftovers, **sorted**, each stating its consequence — "X is true" is not a finding, "X is
true, so Y happens to a user" is. Drop any heading that is empty:

- **Affects this ticket** — a user-visible consequence of what you shipped, or a gap that keeps the
  report from being resolved.
- **Needs its own ticket** — a real defect you deliberately did not fix. One line on what it costs.
- **Noticed, no action** — unrelated, explicitly not this ticket's problem.

A check you performed and cleared is not a leftover at all: review notes or nowhere.
