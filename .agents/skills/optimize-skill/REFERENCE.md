# optimize-skill — reference

## Transcript layout

One JSONL file per session:

```
${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<slug>/<session-uuid>.jsonl
    slug = cwd with every character other than a letter or digit replaced by "-"
```

Every line is one record. Relevant `type` values:

| type | Carries |
|---|---|
| `user` | prompts, and `tool_result` blocks (including errors) |
| `assistant` | text and `tool_use` blocks — this is where `Skill` calls appear |
| `attachment` | hook output, file snapshots, system injections |
| `mode`, `permission-mode`, `ai-title`, `last-prompt` | session metadata, one or two lines each |

Every `user`/`assistant` record also carries `cwd`, `gitBranch`, `sessionId`, `version`,
`isSidechain`. `isSidechain: true` means a subagent turn — exclude unless the retro is about
subagents.

Slash commands arrive as a `user` record whose text is
`<command-name>/clear</command-name>` wrapped in a `<local-command-caveat>` block. Filter prompt
text starting with `<` to get real user turns.

**Glob gotcha.** Project directories start with `-`, so `grep ... */*.jsonl` passes them as flags
and silently matches nothing. Always write `./*/*.jsonl`.

## Extraction

Set up once:

```bash
ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
OUT=<scratchpad>/retro                          # per-session extracts land here
mkdir -p "$OUT"
ls -t "$ROOT"                                   # pick the project's and its worktrees' directories
```

Nothing there for the project → ask the user where the session logs are.

Sessions in the window, newest first, for the directories picked:

```bash
find "$ROOT/<dir>" "$ROOT/<worktree dir>" -maxdepth 1 -name '*.jsonl' -mtime -7 -print0 | xargs -0 ls -t
```

Subagent transcripts are not in the session file. They sit in a sibling directory named for the
session, one JSONL and one `.meta.json` per agent:

```bash
ls <slug>/<session-uuid>/subagents/          # agent-*.jsonl + agent-*.meta.json
jq -r '[.agentType, .description] | @tsv' <slug>/<session-uuid>/subagents/*.meta.json
```

Their existence is the evidence that a review actually ran in fresh context. `isSidechain` inside
the main file is not a reliable proxy — a session can spawn agents and carry no sidechain records.

Real user prompts, truncated:

```bash
jq -r 'select(.type=="user" and (.isSidechain|not))
  | (.message.content | if type=="string" then . else ([.[]?|select(.type=="text")|.text]|join(" ")) end) // empty
  | select(startswith("<")|not) | .[0:200]' "$f"
```

Skills that loaded, in order:

```bash
jq -r 'select(.type=="assistant")|.message.content[]?
  | select(.type=="tool_use" and .name=="Skill") | .input.skill' "$f"
```

Across every project at once (which skills ever fire, and which never do):

```bash
grep -a -h -o '"name":"Skill","input":{[^}]*}' ./*/*.jsonl | sort | uniq -c | sort -rn
```

Slash commands the user typed:

```bash
grep -a -h -o '<command-name>[^<]*</command-name>' ./*/*.jsonl | sort | uniq -c | sort -rn
```

Failed tool calls:

```bash
jq -r 'select(.type=="user")|.message.content[]?
  | select(.type=="tool_result" and .is_error==true) | (.content|tostring)[0:160]' "$f"
```

Tool call sequence, to spot loops:

```bash
jq -r 'select(.type=="assistant")|.message.content[]?|select(.type=="tool_use")
  | [.name, (.input.command // .input.file_path // "")[0:80]] | @tsv' "$f" | uniq -c
```

Branch and version drift within a session (a `version` change mid-file means an upgrade landed
between turns, which can explain a behaviour shift that is not a skill defect):

```bash
jq -r 'select(.gitBranch)|[.gitBranch,.version]|@tsv' "$f" | sort -u
```

## Installed skills inventory

```bash
ls ~/.claude/skills/*/SKILL.md ~/.claude/plugins/*/skills/*/SKILL.md .claude/skills/*/SKILL.md 2>/dev/null
```

Frontmatter of one skill, with the description length that matters for triggering:

```bash
awk '/^---$/{n++; next} n==1' <skill>/SKILL.md          # frontmatter block
```

## Frontmatter fields

| Field | Effect on loading |
|---|---|
| `description` | the primary trigger — matched against the user's request |
| `when_to_use` | appended to description for matching |
| `paths` | glob **filter**, ANDed with the description match; narrows only, never triggers |
| `disable-model-invocation` | `true` → only the user can load it, via `/name` |
| `user-invocable` | `false` → hidden from the `/` menu; the model can still load it |
| `allowed-tools` | pre-approves the listed tools while active; every other tool stays callable |
| `disallowed-tools` | removes the listed tools while active — the only field that restricts |
| `model`, `effort`, `context: fork`, `agent`, `background` | execution shape |
| `argument-hint`, `arguments` | autocomplete and `$name` substitution |

`description` + `when_to_use` are **truncated at 1536 characters** in the listing Claude matches
against. Anything past that is invisible for triggering.

## Report template

```
## Retro — last 7 days, 9 sessions (lodgify-statements)

**Weak description: `release-notes` never loads on "what changed since the last deploy"** · 3 sessions
`.claude/skills/release-notes/SKILL.md` — the description leads with release-please mechanics; add
the literal phrasings used: "what changed since", "changelog for", "what shipped".

**Missing rule: EF migration hand-edits corrected twice** · 2 sessions
`~/.claude/CLAUDE.md` — one line under Engineering defaults: regenerate migrations via
`dotnet ef migrations add/remove`, never edit the Designer or snapshot by hand.

**Wrong body: `investigate-issue` abandoned after Phase 2** · 3 sessions
`.../investigate-issue/SKILL.md` — Phase 3 assumes a Datadog link exists; add the branch for a
plain complaint with no telemetry, replacing the current single-source paragraph.

Not proposed: one permission denial on `gh pr merge` (one-off); three retries against a container
that was simply not running (environment, not setup).
```

## Worked example — diagnosing a trigger miss

A hypothetical project skill, `release-notes`, turns merged PRs into a changelog. The session shows
the user asking "what changed since the last deploy?" and the assistant assembling the list from
`git log` by hand.

1. Confirm the skill was installed during that session — `ls` its directory, check `git log` on it
   for a later creation date.
2. Confirm no `Skill` call fired — the skill-loads extract for that session is empty.
3. Read the frontmatter. `disable-model-invocation` unset, no `paths`. So it was eligible.
4. Compare the description against the user's actual words. The description says "Generate release
   notes from merged PRs using release-please conventions"; the user said "what changed since the
   last deploy". No overlap.
5. Cause: **weak description**. Fix: add the user's phrasings. Not a body problem — the body was
   never reached.

Had the skill carried `paths: "CHANGELOG.md"`, the cause would instead be **`paths` too narrow**:
the question touched no matching file, so the filter excluded it regardless of description quality.
