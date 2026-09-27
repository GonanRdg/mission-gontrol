# Investigate Issue — Reference

## 1. Tools and fallbacks

Required: one source to read, and a checkout of the service that owns the code path. Everything else
degrades.

| Missing | Consequence |
|---|---|
| Atlassian MCP | Ask for the ticket as text; a Slack thread or a Datadog link alone still runs |
| Datadog MCP | Lane A only — say so: a production-only bug without telemetry yields a hypothesis, not a confirmed cause |
| Slack MCP | Ask for the relevant messages as text |
| `implement-ticket` | Phase 4 fallback path, driven here |
| `diagnosing-bugs` | Build the failing test directly, same discipline |
| `code-review` | Inline self-review, and say that is what happened |
| Serena MCP | `grep` and `git log -S` reach the same lines, slower. Same fallback in a worktree the session did not launch in |

## 2. Link parsing (Phase 1)

Accept any mix. Decode percent-encoding before reusing a query (`%3A` → `:`, `%20` and `+` → space).

| Input shape | What to extract | Tool |
|---|---|---|
| `ABC-123`, `https://<jira-site>/browse/<KEY>` | issue key | `getJiraIssue`, `fields: [summary,description,status,issuetype,priority,created,comment,issuelinks,attachment,components]`, `responseContentFormat: markdown`. `cloudId` comes from `getAccessibleAtlassianResources` — never hardcoded; several sites back → match the pasted host |
| `https://<ws>.slack.com/archives/<CHANNEL>/p1712345678901234` | channel id, ts = digits after `p` with a dot inserted 6 from the right → `1712345678.901234` | `slack_read_thread`. `?thread_ts=` in the URL is the parent — read the parent, not the deep-linked reply alone |
| Slack link with `?cid=` / a channel name only | channel | `slack_search_channels`, then `slack_read_channel` |
| Files/screenshots in a thread | file id | `slack_read_file` |
| `app.datadoghq.com/...` (also `.eu`, `us3`, `us5`, `ap1`) | see the Datadog table | never `WebFetch` — re-run the query |
| `app.datadoghq.com/s/<org>/<hash>` | nothing resolvable | shared short link: ask the user for the service, the query and the window |
| Zendesk URL, or pasted customer text | account id, error text, timeline | no tool; treat the text as the report |
| `github.com/<org>/<repo>/pull/<n>` or `/issues/<n>` | repo, number | `gh pr view <n> --json title,body,files,commits`, `gh issue view <n>` |
| A stack trace | namespaces, exception type, message | drives both repo resolution and the code walk |

## 3. Datadog (Phase 1 and 2)

**Skill discovery first, once per session.** Run in parallel: `load_datadog_skill` with a domain name
(`datadog/logs`, `datadog/traces`, `datadog/metrics`) **and** `list_datadog_skills` with the topic
keywords, then load anything that clearly matches. Skip only for a follow-up call in a domain whose
skill is already loaded or confirmed absent.

**Time range from the URL.** `from_ts` / `to_ts` (and `start` / `end` on APM) are **epoch
milliseconds**. `live=true` means the link was relative and its window is meaningless — use the first
occurrence you find instead. Always widen backwards to find the *first* occurrence; the pasted window
is where the reporter happened to be looking, not where the problem starts.

| URL path | Read as | Tools |
|---|---|---|
| `/logs?query=` | log search | `search_datadog_logs`, `analyze_datadog_logs` (patterns, grouping) |
| `/apm/traces?query=` | span search | `search_datadog_spans`, `aggregate_spans` |
| `/apm/trace/<id>`, `?traceID=` | one trace | `get_datadog_trace` — the single highest-value call in an investigation |
| `/apm/error-tracking`, `/error-tracking/issue/<id>` | grouped errors | `search_datadog_error_tracking_issues`, `get_datadog_error_tracking_issue`, `analyze_datadog_error_tracking_errors` |
| `/apm/services/<svc>` | service health | `search_datadog_services`, `search_datadog_service_dependencies` |
| `/monitors/<id>`, `/monitors/manage?q=` | alert definition and state | `search_datadog_monitors`, `monitor_groups_search` |
| `/dashboard/<id>` | dashboard | `get_datadog_dashboard`, then re-run its widget queries yourself |
| `/metric/explorer`, `/notebook/<id>`, `/incidents/<id>` | metric / notebook / incident | `get_datadog_metric`, `get_datadog_metric_context`, `get_datadog_notebook`, `get_datadog_incident` |
| `/orchestration`, `/k8s` | restarts, OOMKills, evictions | `search_datadog_k8s_resources`, `describe_datadog_k8s_resource`, `get_datadog_k8s_manifest` |
| `/databases`, DBM links | slow or locking queries | `get_datadog_database_query_performance`, `search_datadog_database_samples`, `get_datadog_database_explain_plans`, `get_datadog_database_recommendations` |
| `/profiling` | CPU, memory, allocation | `explore_profiling_flame_graph`, `explore_profiling_timeline`, `get_profiling_service_insights` |

Also useful with no link at all:

- **Did a deploy cause it** — `get_change_stories`, `search_dora_events` / `aggregate_dora_events`,
  `search_pr_insights`
- **Kafka / event streaming** — `read_kafka_messages`, `get_subject_kafka_schemas`,
  `list_kafka_topic_configs`, `get_kafka_client_configs`
- **Arbitrary joins across telemetry** — `ddsql_run_query`, after `ddsql_schema_search_tables`

Query hygiene: always pin `env:` and `service:`. Aggregates measure blast radius; **one complete
trace plus its logs finds the cause**. Get both, in that order of importance.

## 4. Resolving the working directory (Phase 1)

```
git rev-parse --show-toplevel 2>/dev/null            # current repo, if any
ls -d ~/src/*/ ~/dev/*/ 2>/dev/null                  # wherever checkouts live
ls -d <current-repo>/../*/ 2>/dev/null               # siblings of the current repo
git -C <dir> remote get-url origin                   # confirm a candidate is what you think
```

Candidate signals, strongest first:

1. Datadog `service:` tag. A service tag usually maps to a repo sharing its stem, with or without
   the organisation prefix (`statements` → `statements` or `<org>-statements`). Get the prefix in use
   from `git remote get-url origin`, then match on the stem.
2. Stack-trace root namespace — `<Org>.Statements.*` → the statements repo, same stem rule.
3. Jira component, or the project key's usual repo.
4. Repo or service names said out loud in the Slack thread.
5. A monolith, where the organisation has one, is the default only when the trace or the feature is
   clearly inside it — not when nothing else matched.

Decision:

- Current repo matches the strongest candidate → use it, state it, do not ask.
- Otherwise **ask once** with `AskUserQuestion`, offering the directories that actually exist on disk,
  the current directory, and "other".
- Candidate not checked out → say so and ask. Never clone unprompted.
- Cross-repo → one primary plus named read-only secondaries.

## 5. Write-up file (Phase 3)

Location ladder, first hit wins:

1. An existing `docs/investigations/`, `docs/rca/`, `docs/incidents/` → use it, match its file naming.
2. `docs/` exists → `docs/investigations/<KEY-or-slug>.md`.
3. Neither → the session scratchpad, and tell the user where it is plus that you can move it into the
   repo.

The file is not part of the fix commit unless the repo already keeps investigations in tree. Keep the
PR body short and free of investigation narration regardless.

```markdown
# <KEY or slug> — <one-line symptom>

- **Sources**: <jira key> · <slack thread> · <datadog link>
- **Service / repo**: <service> · <repo> (+ secondaries)
- **First seen**: <utc timestamp> · **Still occurring**: yes / no / stopped at <deploy>
- **Blast radius**: <n accounts · n events · rate> — from `<the query>`
- **Confidence**: confirmed | best hypothesis (N%)

## Symptom
What the reporter sees, in their terms, plus the verbatim error.

## Evidence
| # | What it shows | Source |
|---|---|---|
| 1 | … | trace `<id>` / `file.cs:42` / log query / commit `<sha>` |

## Root cause
Two or three sentences. The input, the line, and why it did not happen before.

## Ruled out
Hypotheses tested and killed, each with what killed it. Stops the next person re-testing them.

## Fix options
### A — minimal, releasable now
### B — proper
**Recommendation**: A or B, one line of why.

## Plan
1. …  (files, in order)

## Tests
Regression test and its seam; unit; functional/integration if a boundary is crossed. Say if no
correct seam exists.

## Release safety
Optional inputs, additive outputs, neutral defaults, reversible migrations. What bites on
upgrade or deploy.

## Data repair
Records already broken: how many, and whether they need backfill or replay. Or "none".

## Open questions
## Out of scope
```

## 6. Redaction — before anything is written to a file

Strip or mask: customer names, emails, phone numbers, postal addresses, card and IBAN data, auth
headers, bearer and API tokens, webhook secrets, connection strings, full request bodies containing
any of the above.

Keep: account and tenant ids, domain entity ids, trace and span ids, message keys, exception types
and messages, timestamps, service and env names. These are what make the write-up useful and none of
them are PII.

## 7. Worktrees (Phase 4)

Untracked files do not follow a worktree. Copy in before the first build:

| What | Why |
|---|---|
| `.serena/` | memories, and the convention ladder's first rung |
| `.env`, user secrets, dev appsettings | the suite reads them; missing → the build fails on config, not code |

Serena resolves its project from the directory the session launched in, once. `cd` does not move it,
and the `claude-code` context sets `single_project: true`, which disables `activate_project`.

| Session launched in | Serena project | Consequence |
|---|---|---|
| the repo | the repo | symbol edits land in the repo, not the worktree — use plain file tools |
| the worktree | the worktree | symbol tools work normally |

Restarting the session inside the worktree buys Serena back; worth it for a large fix, not a small one.

## 8. Anti-patterns

| Failure | What it looks like | Do instead |
|---|---|---|
| Theory before reading | A root cause proposed before the Slack thread and ticket comments are read | Read every source first — the answer is often in reply #7 |
| Aggregate-only evidence | "1,240 errors in 24h" and no single failing case examined | One complete trace plus its logs, contrasted against a succeeding one |
| `WebFetch` on Datadog | An empty or login page treated as "no data" | Parse the URL params, re-run through the MCP tools |
| Hypothesis sold as cause | Confident prose, no `file:line` | Label confidence and list what would confirm it |
| Asking the obvious | Prompting for a directory when the current repo already matches the service | Use it and say so |
| Symptom fix | A null guard where the null should not exist | Fix the origin; add the guard only as a deliberate, stated second layer |
| Scope creep | Adjacent bugs fixed while "in there" | One line in the report, no diff |
| Silent implementation | Code written because the plan "was obviously right" | Phase 4 needs an explicit go |
| Retention read as absence | "No logs for that recipient" reported as if it weakened the report | Retention, not absence. Retry on archive/flex, then tie by mechanism + account, and say which you did |
| Undifferentiated leftovers | One "not fixed" list mixing a cleared safety check, someone else's bug, and a real consequence | Sort into affects-this-ticket / needs-its-own-ticket / noticed-no-action; state the consequence per line |
| Hypothesis theatre | A ranked list of three to five posted for a cause already pinned to a line | Confirmed is confirmed — state the mechanism, cite the line, move on |
| Gate before comprehension | A go/no-go picker in the same message that first explains the model | Explain, let them answer in words, gate the turn after |
| Stale tree state | "Working tree is dirty" from the session-start snapshot, then a no-op stash | `git status --porcelain` at the top of Phase 4, decide from that |
| Stashing work you do not own | `git stash` on a dirty tree that another session or task is mid-way through | `git worktree add ../wk-<taskname>`, leave the tree untouched, say where you moved |
| Cleared checks listed as debt | "Removing the public method is safe because X" filed under "not fixed" | A check you performed and cleared is not a leftover — review notes or nowhere |
