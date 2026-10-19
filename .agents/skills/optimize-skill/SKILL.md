---
name: optimize-skill
description: >
  Retrospective over past Claude Code sessions that turns what went wrong into concrete edits to
  skills and rules — a skill that should have loaded and did not, a correction repeated across
  sessions, a rule that only exists in your head. Use when the user says "retro", "retrospective",
  "review the last sessions", "what went wrong this week", "improve my skills", "optimize this
  skill", "why didn't the skill trigger", "which skill is missing", "audit my setup", or asks for
  a session post-mortem. Also use to tune one skill's description or body against evidence from
  transcripts. Not for reviewing product code — that is code-review or verify-claims.
argument-hint: "[skill name | project path] [--since 7d]"
allowed-tools: Read, Grep, Glob, Bash
disallowed-tools: Edit, Write, NotebookEdit
model: opus
---

# Optimize Skill

Sessions leave a trace. Corrections, retries and skills that never loaded are recorded in the
transcripts, so the setup can be tuned against evidence instead of memory.
[REFERENCE.md](REFERENCE.md): transcript layout, verified extraction commands, frontmatter field
table, report template, worked example.

Three hard rules:

1. **Propose, never apply.** Output is a ranked list of edits. The user applies them. A skill that
   edits its own siblings from its own reading of its own failures compounds one bad inference
   across every future session.
2. **Recurrence gates a proposal.** A signal earns an edit when it appears in **≥2 sessions**, or
   in one session that cost real work (a wrong path taken to completion, a destructive redo). One
   annoyed message is not a rule.
3. **Every proposal names what it removes.** Skill bodies only ever grow, and a bloated body dilutes
   the instructions already in it. An addition over ~5 lines states which lines it replaces, or it
   is not a proposal.

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
⬜ 1 Scope    — which projects · which window · which skills are in play
⬜ 2 Extract  — transcripts → scratchpad summaries, never read raw jsonl inline
⬜ 3 Signals  — corrections · loops · denials · trigger misses · abandoned skills
⬜ 4 Diagnose — each signal to exactly one cause class
⬜ 5 Propose  — ranked edits · what happened, cause, path + the concrete change
```

## Phase 1 — Scope

Default window: last 7 days, current project only. `--since`, a project path, or a skill name
narrows or widens it. Ask only if the argument is ambiguous.

Session logs live under `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/`, one directory per working
directory, named after its path with every character other than a letter or digit replaced by `-`
(`/Users/jane.doe/src/repo` → `-Users-jane-doe-src-repo`). List that folder and take the
directories for the project and its worktrees; a worktree has a directory of its own, and that is
usually where the long sessions are. None found → ask the user where the session logs are.
Exclude this session, `${CLAUDE_SESSION_ID}` — a retro of the session running the retro measures
nothing.

Sessions of the *toolbox repo itself* are usually noise (they are about writing skills, not using
them) — exclude unless the user asked to retro skill-authoring.

Inventory what was available to load: `~/.claude/skills/`, plugin skills, project `.claude/skills/`.
A skill that does not exist cannot have failed to trigger.

## Phase 2 — Extract

Transcripts run 400KB–1MB each. **Never read one inline.** Every command in REFERENCE.md writes
compact per-session extracts to the scratchpad; work from those.

Directory names begin with `-`, which grep reads as a flag. Always prefix `./` in globs.

Keep per session: prompts (truncated), skill loads, slash commands, tool-error results, the tool
call sequence. Drop `isSidechain: true` entries unless the retro is about subagents.

## Phase 3 — Signals

| Signal | How it shows up |
|---|---|
| **Correction** | user turn that reverses the previous assistant action — "no", "I said", "revert that", a re-ask of the same question in different words |
| **Trigger miss** | work that matches an installed skill's job, with no `Skill` tool call in the session |
| **Abandoned skill** | skill loaded, then the transcript ignores its phases — the body did not fit the task |
| **Loop** | the same command or edit retried ≥3 times, or an edit reverted then reapplied |
| **Denial** | permission refusal on a call the work genuinely needed |
| **Re-explanation** | the user asking the same thing twice means the first answer failed, not that they forgot |

Count sessions per signal, not occurrences. Ten retries in one session is one signal.

## Phase 4 — Diagnose

Each signal lands in exactly one cause. Guessing across two is how retros produce rules nobody
wanted.

| Cause | Evidence that picks it | Where the fix goes |
|---|---|---|
| **Weak description** | skill existed, work matched it, never loaded | the `description` field |
| **`paths` too narrow** | skill has `paths:` and the work touched files outside them | frontmatter |
| **Wrong body** | skill loaded and was abandoned or fought | SKILL.md phases |
| **Missing skill** | recurring multi-step work with no skill covering it | a new skill |
| **Missing rule** | same correction across projects, no procedure involved | CLAUDE.md |
| **User fact** | a preference or environment fact, not a procedure | memory file |
| **One-off** | happened once, cost nothing | nothing — say so |

Trigger-miss specifics, all verified against the docs:

- `description` + `when_to_use` are **truncated at 1536 characters** in the skill listing. Past that
  the tail is invisible, and trigger phrases are usually in the tail. Report the current count.
- **`paths:` filters, it does not instruct.** It is ANDed with the description match — it can only
  stop a skill loading, never cause it. A skill that fails to trigger is never fixed by adding
  `paths`.
- Triggers are the user's words, not the domain's. A skill triggers on "why is this slow", not on
  "performance regression analysis", unless the user actually types the latter.
- `disable-model-invocation: true` means only `/name` loads it. Check before diagnosing anything.

**Hooks are not a fix here.** Injecting skills or rules from a hook pays tokens on every prompt and
overrides the model's judgement about relevance, and it hides the defect instead of correcting it.
A trigger miss is fixed in the `description`; a standing rule belongs in CLAUDE.md. Never propose a
hook, in any phase.

## Phase 5 — Propose

Ranked by sessions affected × cost. **At most 5.** Each point states what happened, which cause,
and the concrete edit, in full sentences the user can act on without opening the transcript. No
narrative, no transcript quotes longer than a clause.

```
## Retro — <window>, <n> sessions

**<Cause>: <one-line defect>** · seen in <n> sessions
`<path>` — <the concrete edit, quoted where it is a wording change>

...

Not proposed: <one line per recurring signal deliberately left alone, and why>
```

The trailing line matters as much as the proposals. It is what stops the next retro re-raising the
same one-off.

Wording changes to a `description` show before → after, with the resulting character count when the
field is anywhere near 1536.

## Anti-patterns

- Applying an edit. The skill proposes.
- A rule from a single annoyed message.
- Adding lines to a SKILL.md without saying which lines they replace.
- Reading raw transcripts into context instead of extracting to the scratchpad.
- Diagnosing a trigger miss as a body problem, or the reverse — they have different fixes.
- Proposing `paths:` to make a skill load more often. It cannot.
- Proposing a hook. The fix is a description, a body, or a rule — never an injection.
- Retro of a session that was *about* writing skills, reported as a skill failure.
- Counting occurrences instead of sessions, so one bad afternoon outranks a standing defect.
- Praise, tallies of how many sessions were read, narration of the extraction.
