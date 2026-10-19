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
| DB access | Hand the queries to the user, batched, read-only, with what each result would decide — see Lane C. Never infer a datastore's state from application logs alone |

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

**Do not guess parameter names.** Much of this surface is deferred — the name is visible, the schema
is not. Load the schemas with `ToolSearch` (`select:<tool>,<tool>`) before the first call to anything
outside the common log/span/metric set, and especially to DBM, change-story and workflow tools. A
parameter rejection means the schema is unknown: load it, then call. Never a second guess, never a
third.

Database instance work (`postgresql`, `mysql`, …) beyond the DBM row above:
`find_datadog_database_instances` for the instance id, then
`get_datadog_database_health_signals`, `get_datadog_database_query_statement`,
`get_datadog_database_calling_services`, `get_datadog_database_explain_plans`. A managed instance
(Cloud SQL, RDS) publishes host-level limits under the cloud namespace, not the agent one —
`gcp.cloudsql.*` / `aws.rds.*` for cores, CPU, memory and backends; `postgresql.*` /
`mysql.*` for the in-engine view. `MISSING_DATA` on one side is a reason to look on the other, not
a reason to conclude.

## 4. Resolving the working directory (Phase 1)

```
git rev-parse --show-toplevel 2>/dev/null            # current repo, if any
git remote get-url origin                            # its organisation and naming prefix
```

The signals below decide whether the open repo is the right one. Signals, strongest first:

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
- Otherwise reach the code of the service the evidence names, in this order, and say which was used:
  1. **A sibling of the open repo** matching its stem — one look in the open repo's parent directory,
     wherever that is: `ls -d "$(dirname "$(git rev-parse --show-toplevel)")"/*<stem>*/`.
  2. **`gh` read-only, best effort**, at the deployed ref — the Datadog `version:` tag or the image
     sha; the default branch only when neither is known, and say so:
     `gh search code --repo <org>/<repo> "<symbol>"`,
     `gh api "repos/<org>/<repo>/contents/<path>?ref=<ref>" --jq .content | base64 -d`.
     No LSP and no build; code search can miss. A trace that needs more than a few files → say so
     and go to 3.
  3. **Ask once** for a path, or for the user to clone it.
- Never scan the disk or the organisation, never clone unprompted.
- Cross-repo → one primary plus named read-only secondaries.

## 5. Write-up file (Phase 3)

Location ladder, first hit wins:

1. An existing `docs/investigations/`, `docs/rca/`, `docs/incidents/` → the repo already keeps
   investigations in tree, so use it and match its file naming.
2. Otherwise **outside the repo**, at a path that survives `/clear` and the end of the session: the
   agent's durable notes directory when it has one, else `~/.claude/investigations/` in Claude Code.
   Never the session scratchpad — the implementation may run in a fresh session. Most investigations are never committed — a new `docs/investigations/`
   created for one write-up is unwanted tree noise. Say the path, and offer to move it in.

The file is not part of the fix commit unless case 1 applies. Keep the PR body short and free of
investigation narration regardless.

It is the answer to "give me the full detail" and to a lost context window — so it carries the
things the chat summary drops: every metric with its ceiling, the ruled-out hypotheses with what
ruled them out, the query text, the full EXPLAIN, the handoff block as sent.

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
Each names the repo it lands in — the one that owns the defect.
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

## Handoff
Filled when the user says to implement; `implement-ticket` builds from this section.
- **Fix**: <approved option, one line> · **Repo**: <repo it lands in>
- **Acceptance criteria**: 1. … (numbered, observable)
- **Out of scope**: …
- **Sources**: <ticket · thread · Datadog link>
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
| `.env`, user secrets, dev appsettings | the suite reads them; missing → the build fails on config, not code |

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
| Saturation without a ceiling | "The server ran out of connections" from a connection count with no `max_connections` beside it | Value and limit in the same sentence, or label it a hypothesis and name the falsifier |
| Inference where a query was waiting | Pages of telemetry reasoning about a datastore whose index list is two commands away | Lane C: run the structural checks, or hand them to the user with what each would decide |
| Parameter roulette | The same tool called four times with `db_type`, `database_type`, `dbType` | `ToolSearch` the schema after the first rejection |
| Summary assembled from history | "As I said above, plus the correction, plus this new table" | One canonical block, rewritten whole when a fact changed |
| Compress on request | A long report, then "shorter", then "shorter" | The first version is the shippable one; overflow was always the write-up's job |
