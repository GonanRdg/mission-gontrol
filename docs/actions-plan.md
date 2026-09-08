# Actions

Launch a packaged agent workflow against a project from a form, instead of typing a prompt.
An action collects typed context, renders it into a prompt, and starts a normal agent session
with that prompt pre-submitted. Everything after Start is an ordinary Mission Control session.

## Concepts

| Term | Is | Lives in |
|---|---|---|
| **Action** | A card in the grid: icon, title, form spec, prompt template | `SKILL.md` frontmatter (`mc-action:` block) |
| **Wrapper skill** | The skill carrying that block. Not invoked by the model | `<root>/skills/<name>/SKILL.md` |
| **Workflow skill** | The real end-to-end skill the action drives (`implement-ticket`, …) | Same roots, referenced by `mc-action.skill` |
| **Run** | One agent session spawned by an action | `tasks` row with `action` set |

The wrapper is the binding seam: repointing an action at a different workflow skill is an edit to
one frontmatter key, not a fork of the workflow skill.

## `mc-action` schema

```yaml
---
name: implement-feature
description: Build a new feature or complete a tracked ticket.
disable-model-invocation: true
mc-action:
  title: Implement ticket
  icon: code                   # SessionIcon id (src/lib/session-icons.ts)
  accent: blue
  skill: implement-ticket      # workflow skill this action drives
  agents: [claude-code, codex] # optional narrowing; default = all launcher-visible
  worktree: true               # default true when absent
  sources:                     # repeatable typed context rows
    - { id: jira,    label: Jira ticket,     widget: url,      icon: file-text,
        placeholder: "ABC-123 or browse URL", token: jira-key }
    - { id: slack,   label: Slack thread,    widget: url,      icon: message-square }
    - { id: github,  label: GitHub PR/issue, widget: url,      icon: git-branch, token: pr-number }
    - { id: file,    label: File or path,    widget: path,     icon: folder }
    - { id: text,    label: Notes / paste,   widget: textarea, icon: search }
  sourcesMin: 1
  inputs:                      # fixed, non-repeatable fields
    - { id: repo,   label: Repository, widget: project, required: true }
    - { id: branch, label: Branch,     widget: branch,
        help: If empty, the workflow derives one. }
  options:
    - { id: plan, label: Create execution plan, default: true }
    - { id: pr,   label: Open PR when done,     default: true }
  prompt: |
    /implement-ticket
    {{#sources.jira}}Ticket: {{.}}{{/sources.jira}}
    {{#sources.slack}}Slack: {{.}}{{/sources.slack}}
    {{#sources.text}}Context: {{.}}{{/sources.text}}
    {{#inputs.branch}}Work on branch `{{.}}`.{{/inputs.branch}}
    {{#options.plan}}Write an execution plan before editing.{{/options.plan}}
    {{#worktree}}You are in a fresh worktree on throwaway branch `{{worktree.branch}}`.
    Rename it (`git branch -m <your-name>`) rather than branching again.{{/worktree}}
---
```

### Widget vocabulary

Fixed set, owned by the app. A new widget is an app release; a new *source type* is a file edit.

| Widget | Renders with | Allowed in |
|---|---|---|
| `text`, `url` | `TextField` | sources, inputs |
| `textarea` | `TextField` multiline | sources, inputs |
| `path` | `FileFinderDialog` picker | sources, inputs |
| `select` | `ScopeDropdown`-style menu | sources, inputs |
| `project` | `ProjectPicker` | inputs |
| `branch` | `BranchTypeahead` | inputs |
| `checkbox` | options list | inputs |

A source row holds one value the agent should read, so the single-valued configuration widgets are
rejected there — repeating a project picker or a checkbox per context row means nothing.

### Template language

Interpolation and presence-conditionals only. No helpers, no partials, no expressions.

| Form | Meaning |
|---|---|
| `{{path}}` | value, empty string when unset |
| `{{#path}}…{{/path}}` | block included when the value is non-empty; `{{.}}` is the value |
| repeated rows | block repeats per row, in entry order |

### Validation

Parsed with `yaml`, validated with a zod schema. A block that fails either renders as a **broken
card carrying the parse error**. A card that silently disappears is indistinguishable from a
missing file.

Keys that change behaviour fail the block. Cosmetic keys — `icon`, `accent` — degrade instead: an id
this build does not know is dropped and the card renders with the default, so a skill written against
a newer icon set is not unusable on an older app.

## Discovery

Roots, highest precedence first. Dedupe by `name`; the first root wins.

```
<project>/.claude/skills   <project>/.codex/skills
~/.claude/skills           ~/.codex/skills
dist/bundled-skills
```

- Dot-directories are skipped — excludes `~/.codex/skills/.system/` (Codex built-ins).
- Plugin marketplaces are **not** scanned: `~/.claude/plugins/marketplaces/**` mirrors the same
  skill under `skills/`, `.cursor/skills/`, `.windsurf/skills/`, so it needs dedupe rules first.
- The project tier is why the surface is project-scoped (see [Surface](#surface)).

### Harness availability

An action is defined by whichever root won. The **workflow skill** it names must exist under the
root belonging to the *selected agent*, or the run does nothing useful — the slash command is not
recognised and the agent improvises from the surrounding text.

Start is blocked with a one-click install:

| Source | Rule |
|---|---|
| Skill found under another root | **Mirror it** — symlink `~/.codex/skills/<name>` → `~/.claude/skills/<name>` |
| Windows without developer mode | copy (`symlinkSync` throws) |
| Found nowhere | copy from `dist/bundled-skills` |

Always an explicit click showing source and destination. Writes land outside any project.

## Surface

Route `/projects/$id/actions`, two panes.

```
┌──────────────────────────────────────────────┐
│ MC › Reservations › Actions                  │
├───────────────┬──────────────────────────────┤
│ Implement     │  Source rows   [type ▾][ … ] │
│ Investigate   │  Repository    [ … ]         │
│ Review code   │  Branch        [ … ]         │
│ Explore idea  │  Options       [x] [x]       │
│               │  ▸ Prompt (live preview)     │
│               │              [Start action]  │
└───────────────┴──────────────────────────────┘
```

Entered from a button beside `▶` in `ProjectBar`. `▶` (`CustomScriptsButton`) is untouched — it
runs project custom scripts and hides itself when a project has none.

From the dashboard the button opens the last-used project's Actions.

## Launch

```
Start
 ├─ worktree: true  → createWorktree(projectId, name)   ── name from §Worktree naming
 │                    run project.worktreeSetupCommand in a shell session (when set)
 ├─ resolve prompt from template + form values
 ├─ createSession({ agent, branch, … }, { initialInput: prompt, focusOnCreate: true })
 └─ tasks row written with action = <action name>
```

Nothing new in the runtime. `createSession` (`src/routes/projects.$id.tsx:1461`) already takes
`initialInput`; it is stashed in `src/lib/voice-session-prompts.ts` and written by
`electron/pty-manager.ts` once the agent TUI has settled, followed by a CR.

`submitInitialInput` stays `true` — the prompt is inspectable before Start via the live preview,
so there is nothing to read afterwards.

### Branch

The branch field is a **hint interpolated into the prompt**. The workflow skill names and creates
the branch; it knows the ticket type, Mission Control does not. `tasks.branch` is a display label
and stays that way — no `checkoutGitBranch` on the launch path.

### Worktree

`worktree` defaults to `true` when the key is absent, so forgetting it yields the isolated
behaviour. Isolation matters because both bundled workflow skills stash a dirty tree
(`implement-ticket/SKILL.md:50`, `investigate-issue/SKILL.md:243`): two runs sharing one tree means
the second agent offers to stash the first agent's live edits.

For `worktree: false` actions, Start warns when the project already has a run in a non-terminal
state, and offers to jump to it.

`createWorktree` gains a `name` parameter. `WORKTREE_NAME_RE`
(`/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/`, `src/shared/worktrees.ts:4`) relaxes to allow 2–5 segments;
`deleteWorktree` already refuses to re-validate stored names, so older rows are unaffected.

#### Worktree naming

1. **Structured token** from a source row declaring `token:` — `implement-mc-1234`,
   `investigate-pr-812`. Free, instant, available before spawn.
2. **Cheap-model slug** when every filled source is free text — one print-mode call reusing the
   `src/server/services/title-generator.ts` pattern.
3. **Word triple** (`generateWorktreeName`) when the CLI call fails or is unavailable.

Collisions take a numeric suffix. A live worktree is never renamed — the session's cwd sits
inside it.

## Persistence

| What | Where |
|---|---|
| Last-used repo, agent, branch, options, active source types per (action, project) | `appSettings` JSON blob — no migration |
| Source *values* | not stored; the ticket URL differs every run |
| Run → action link | new nullable `tasks.action` column (the action's `name`) — one additive migration |

No named templates. The input that varies is the one a template cannot carry.

## Session switcher

Top-bar button opening a palette of live sessions across all projects.

| Group | Contents | Order |
|---|---|---|
| Live | `needs-input`, `running`, `interrupted` | `needs-input` first, then by `updatedAt` desc |
| Recently finished | `finished`, unarchived, capped at 10 | `updatedAt` desc |

Grouped by project. Selecting navigates to `/projects/$id` and selects the session in the grid;
focus mode stays a deliberate act.

`isActiveStatus` is not the filter — `countsAsActive` is `true` for `finished` as well
(`src/shared/domain.ts:31`). Membership is status-explicit.

Live updates ride the existing SSE stream (`/api/events`, `src/server/controllers/events.controller.ts:51`)
through the shared `EventSource` in `src/lib/use-events.ts`. No polling.

New endpoint: `GET /api/tasks/active` — cross-project, status-filtered, project-grouped.

## Bundled actions

| Action | Workflow skill | Source shape | Outcome | `worktree` |
|---|---|---|---|---|
| Implement ticket | `implement-ticket` | URLs, free text | PR | true |
| Investigate issue | `investigate-issue` | URLs, free text | RCA + fix plan | true |
| Review code | `code-review` | base ref | Review | true |
| Explore idea | `research` | free text | Markdown in repo | false |

Four distinct axes: URL source with a code outcome, URL source with a document outcome, ref source,
and free-text source without a worktree.

Bundling means adding the wrapper and workflow skills to `.agents/skills/` and appending to
`BUNDLED_SKILL_NAMES` in `scripts/copy-bundled-skills.mjs`. The bundled `implement-ticket` and
`investigate-issue` are copies of the current global ones, which carry no org-specific values —
site ids are discovered via `getAccessibleAtlassianResources`, hosts arrive in the source rows.

A user's own copy under `~/.claude/skills` outranks the bundled one, so an existing machine keeps
its current behaviour.

## Files

| Area | Path |
|---|---|
| Schema + widget vocabulary | `src/shared/skill-actions.ts` (new) — renderer-reachable, so no `yaml` import here |
| SKILL.md parsing | `src/server/services/skill-actions.ts` (new), `yaml` dep |
| Discovery | `src/server/services/skill-discovery.ts` (new) |
| Harness install | generalise `install-diagram-skill.ts` + `install-ship-skills.ts` into `install-bundled-skill.ts`; reuse `copySkillTree`, `assertSafeProjectRelativePath` |
| API | `skills.controller.ts` (list actions, install workflow skill), `tasks.controller.ts` (`/api/tasks/active`) |
| Route | `src/routes/projects.$id.actions.tsx` (new), `pnpm generate:routes` |
| Form | new views; reuse `ProjectPicker`, `BranchTypeahead`, `FileFinderDialog`, `TextField`, `MarkdownPreview` |
| Launch | `createSession` call site in `src/routes/projects.$id.tsx` |
| Worktree | `createWorktree(projectId, name?)`, `WORKTREE_NAME_RE` |
| Schema | `tasks.action` column + migration |
| Switcher | new palette view + `/api/tasks/active` |
| Bundling | `.agents/skills/*`, `scripts/copy-bundled-skills.mjs` |

## Phases

Each phase ends with a local commit, typecheck and tests green.

1. Parse + discover. `yaml` dep, zod schema, discovery across the five roots, dedupe, broken-card
   error surface. Unit tests over fixture skill trees.
2. Route + form. Grid, typed source rows, widgets, live prompt preview. No launch yet.
3. Launch. Worktree creation and naming, prompt render, `createSession`, `tasks.action` column.
4. Harness install. Mirror/symlink/bundle path, Start gating.
5. Bundled actions. Four wrappers plus workflow skills.
6. Session switcher. `/api/tasks/active`, palette, SSE wiring.

## Out of scope

- Custom action authoring in-app. Actions are files; an agent writes them.
- Named templates.
- A global `/actions` route.
- Write tests and Refactor actions — no workflow skill exists for either.
- Plugin marketplace discovery.

## Open

- **Worktree cleanup.** Nothing prunes `.worktree/<name>` once a PR opens. Candidates: manual,
  auto-remove on session archive, or a merged-branch sweep.
- **`worktreeSetupCommand` becomes a prerequisite.** It is `null` on every registered project, so
  a `worktree: true` action lands in a tree without `node_modules` and cannot run tests. Either
  prompt for it before the first worktree action, or infer a default per project type.
