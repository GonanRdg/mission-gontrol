# Implement Ticket — Reference

## Convention lookup ladder (Phase 2)

Read every rung that exists; later rungs supplement earlier ones. Stop when you have build, test and
coverage commands plus a testing style.

| Rung | Source | Notes |
|---|---|---|
| 1 | `CLAUDE.md`, `AGENTS.md` | Repo root and the subproject you are touching |
| 2 | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | Common where there is no `CLAUDE.md`, often the only convention file |
| 3 | `.cursorrules`, `.cursor/rules/*`, `.windsurfrules` | Same content, different vendor |
| 4 | `CONTRIBUTING.md`, `README.md`, `docs/` | Process, setup, sometimes test commands. Public settings tables live here |
| 5 | The code + `git log --oneline -30` | Fallback. Say in the report that you inferred |

No convention files does not lower the bar. Infer from the code what the files would have said —
build and test commands from the build files and CI config, testing style from the tests beside the
code being changed, naming and layering from its neighbours, commit style from the log. Read as much
as the change's risk warrants: a one-file fix needs its neighbours, a new seam needs the patterns
around every place it touches.

PR machinery, checked separately:

| What | Where it hides |
|---|---|
| PR template | `PULL_REQUEST_TEMPLATE.md` or `pull_request_template.md` (both casings in use), at root, `.github/`, or `docs/` |
| Title enforcement | `.github/pr-title-checker-config.json` (`regexp` field), `.github/workflows/pr-title-checker.yml`, `release-please.yml` |
| Reviewers | `.github/CODEOWNERS` |
| Default branch | `git symbolic-ref refs/remotes/origin/HEAD` — do not assume `main` |

Variance is wide even inside one organisation: no template and no agent file at all (default branch
`master`, the code the only source); a title regex plus release-please; a conventional-commit
glossary embedded in the template; nothing but `.github/copilot-instructions.md`. Check each repo —
never carry over what the last one did.

## Worktrees (Phases 1-2)

Untracked files do not follow a worktree. Copy in before Phase 3:

| What | Why |
|---|---|
| `.env`, user secrets, dev appsettings | the suite reads them; missing → Phase 3 fails on config, not code |

## Ticket type → branch and commit type (Phase 2)

| Ticket type | Type prefix |
|---|---|
| Bug, Defect, Incident | `fix` |
| Story, Task, New Feature | `feat` |
| Tech Debt, Improvement, Refactor | `refactor`, or `chore` when nothing ships |
| Documentation | `docs` |
| Spike / Research | `chore` (and question whether a PR is the right output at all) |

Another tracker's types and labels map by meaning, not by name — whatever means a defect is `fix`.
No type at all → read it off the work itself.

Branch `<type>/<TICKET-KEY>-<kebab-slug>`, slug from the summary, ~5 words. A narrower repo `regexp`
(e.g. `^(feat|fix|chore|refactor|docs|build|tech-debt)`) wins.

## Tracker status move (Phase 2)

Jira, via Atlassian MCP, is the wired path. `getTransitionsForJiraIssue` returns only what is
available from the ticket's *current* status, and workflows differ per project. Match generically:

1. Case-insensitive on the **target status** (`transitions[].to.name`) first — target names are
   stable, transition names are not, and two differently named transitions often land on the same
   target status.
2. Fall back to the transition's own `name`.
3. Preferred targets, in order: `In Progress`, `Start Progress`, `In Development`, `Doing`, `Start`.
4. Never hardcode ids — they are workflow-local, and the same numeric id means a different
   transition in another project's workflow.

No match → skip and note it. Never invent a transition or chain two to force a path. Status only;
this skill never comments on the ticket.

Another tracker — Linear, GitHub Issues, Azure DevOps — takes the same in-progress move through
whatever tool is connected, matching on target state by meaning. No tool for it → the user moves it;
say so in the report rather than asking mid-run.

There is no review move: the PR opens as a draft, and the user moves the ticket when they mark it
ready.

## Plan sketch shape (Phase 2)

Ten lines at most, in chat, never a file:

```
Plan — ABC-123 retry failed webhooks
files    Webhooks/WebhookDispatcher.cs (retry policy) · Webhooks/RetryOptions.cs (new)
         Data/OutboxContext.cs + migration AddWebhookAttemptCount
seams    Dispatch_retries_transient_5xx_up_to_the_configured_ceiling
         Dispatch_gives_up_on_4xx_without_retrying
         Attempt_count_survives_a_process_restart
shape    RetryOptions optional, ceiling defaults to 1 = today's behaviour; migration adds a
         nullable column, reversible
tests    unit on the policy; integration on the outbox in Webhooks.IntegrationTests (Postgres
         Testcontainer)
```

Structural change → stop here for approval. Otherwise post and carry on.

## Covering the change (Phase 3)

90-100% of **new and changed** code, read off your own diff: new branches, guard clauses, null/empty
cases, thrown exceptions, early returns, new public entry points. A judgement, not a measurement —
no coverage tooling to install, no report to build, no waiting on Sonar, and a project-wide average
says nothing about a 30-line diff. A coverage command the repo already defines is worth a cross-check
on a large diff only. Then ship, without cataloguing gaps for the reader.

## Review scaling (Phase 3)

Size scales how many agents run, never whether they run. There is no inline rung: every review is a
subagent review.

| Diff size | Review |
|---|---|
| Small — under ~50 changed lines, no new public API, no boundary crossed | Two subagents, spec and standards |
| Normal feature or fix | Code review, spec + standards axes |
| Large, cross-cutting, security-relevant, or a public/published API | Two-axis run plus a targeted third agent for the risky dimension |

The briefing rules hold at every size — see Phase 3. Each agent gets the same brief and no knowledge
of the others; order between them is irrelevant, isolation is not.

### Scope fence

The unit of review is the diff, not the subsystem it lands in: a finding anchors on a `+` line of
`git diff <merge-base>...HEAD`, quotes `file:line`, and names what breaks. Breach signs — a fix that
would touch files outside the diff, a finding in a layer the ticket never changed, a rebuttal longer
than the finding.

Outside the repo is outside the review. A package under `~/.nuget`, `node_modules`, `vendor/`, a
decompiled or generated file, a path in another service's checkout: state the package or service and
the behaviour in one line, then stop — no fix, no proposed patch, no upgrade plan. A finding that
only becomes actionable by editing code the repo does not own is a report line, not a finding.

### Stack vocabulary

Symbols, keywords and type names come from the diff, in the diff's own language and casing — never a
placeholder borrowed from another stack. Unsure of a word? Quote the line instead of naming it.

## PR body

Repo template → fill it honestly, deleting placeholders you cannot truthfully fill. No template →
this, and nothing more:

```markdown
## <TICKET-KEY>

<the ticket's own URL, copied — never a guessed site host>

<Two to four sentences: what now happens that did not before, and the one design decision a reviewer
would otherwise stop and question.>

<One or two bullets, only when they exist: config a consumer must set, behaviour that changes on
upgrade, migration ordering, a follow-up already known.>

Tests: <one line — what level, and that the suite is green.>
```

Ceiling ~25 lines. A genuinely complex change earns at most one addition: a small before/after, a 3-5
row table, or a mermaid diagram. Never a per-file changelog — the diff is the changelog, and a long
body goes unread. Minor findings, alternatives considered, naming debates, process narration, build
output and AI attribution stay out; they belong in the chat report.

## Scrub before every `git commit`, `gh pr create`, `gh pr edit`

Grep the message or body for `Claude`, `Co-Authored-By`, `🤖`, build or test output, and process
narration (tree state, who asked, when, "originally … then", offers and asides to the reader). Strip
any hit. The harness's own git guidance suggests the `Co-Authored-By` and `🤖 Generated with` footers
— that conflict is what causes the slip, and it has already shipped once in a PR body.
