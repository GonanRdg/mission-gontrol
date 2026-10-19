---
name: write-adr
description: >
  Write an Architecture Decision Record for a change whose approach needs thinking: what forces
  are in play, the one to three options that were genuinely on the table with their pros and
  cons, and the decision. Use when the user says "write an ADR", "record this decision",
  "document the approach", "ADR for X", or asks which of several approaches to take on something
  hard to reverse — adding Kafka publishing, introducing a rate limiter, choosing a storage
  model, splitting a service, picking an integration pattern. Not for routine work: a new
  endpoint, a new column, a new setting need no ADR. Not an implementation plan — no file lists,
  no task breakdown; the plan comes after.
argument-hint: <the decision, a ticket key/URL, or a doc/thread describing the problem>
model: opus
---

# Write an ADR

An ADR answers one question for a reader six months out: *why is it built this way, and what did
we say no to?* [REFERENCE.md](REFERENCE.md): decision test with worked examples, full template,
diagram rules, discovery commands, worked ADR, superseding.

Two hard rules specific to this skill:

1. **It is not a plan.** No file lists, no migration steps, no task breakdown, no estimates. The
   decision and its forces only. A plan is written after, from the accepted ADR.
2. **It has to be understood by someone who was not there.** Write for an engineer opening it cold,
   with no context from this session and no house shorthand: full sentences, ordinary grammar, the
   causal words (*because*, *so*, *unless*) that carry the argument. Pros and cons may be phrases,
   but each must make sense on its own. Length follows the decision, not a budget: every sentence
   states a force, a trade-off, a consequence, or why one option won. A sentence that does none of
   those is cut; one that does stays, even if the ADR runs longer. Never drop a force or a cost to
   look shorter, and never compress into notes, arrows or dropped articles that leave the reader to
   rebuild the point. Section caps in REFERENCE.md.

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
⬜ 1 Gate      — does this decision even warrant an ADR
⬜ 2 Convention — find existing ADRs · path, numbering, template, status field
⬜ 3 Options    — 1–3 real candidates · pros/cons each · kill strawmen
⬜ 4 Write      — template · section caps · readable prose · diagram only if it earns it
⬜ 5 Land       — write file · report path · offer the plan as next step
```

## Phase 1 — Gate

Write an ADR only when **all three** hold:

- **Hard to reverse** — undoing it costs weeks, or a migration, or a contract change.
- **Surprising without context** — a future reader would otherwise ask "why on earth this way?"
- **A real trade-off** — there were genuine alternatives, or one path with a cost worth recording.

Not all three → say so in one line and move on. No ADR for a new endpoint, a new field, a new
config value, a library bump, or a bug fix. Yes for Kafka publishing, a rate limiter, event
sourcing, a jsonb-vs-columns storage model, a cross-domain integration pattern. Table of judged
examples in REFERENCE.md.

One-option ADRs are valid: when only one way exists, record the forces that make it the only way
and the cost being accepted. That is still a decision.

## Phase 2 — Convention

Look for existing ADRs before inventing anything: `docs/`, `docs/adr/`, `docs/decisions/`,
`doc/arch/`, `architecture/`, `.adr-dir`. Commands in REFERENCE.md.

Found → match it exactly: same directory, same filename pattern, same numbering, same section
headings, same frontmatter, same diagram flavour. A repo on MADR or Nygard keeps its own headings;
the mapping to this skill's sections is in REFERENCE.md. Match a repo that keeps prose loose rather
than imposing this skill's template on it.

None → `docs/adr/NNNN-kebab-slug.md`, `0001` first, creating `docs/` and `docs/adr/` now. Monorepo
with per-package docs → the ADR sits with the package it binds; system-wide ones at the root.

Never stop to ask about any of this. Placement, numbering width, date format, status vocabulary,
diagram flavour are all decided from the repo or from the defaults above and reported in one line
at the end. The only thing worth a question is a decision the ADR itself cannot settle.

## Phase 3 — Options

One to three. Three is the ceiling, not a target — inventing a third to fill the table is worse
than two.

An option qualifies only if a competent engineer would actually propose it. A strawman ("do
nothing", "rewrite everything in Rust") is padding; drop it. Two credible options and one honest
sentence on why nothing else was considered beats a table of five.

Per option: **what it is** in one sentence, then pros and cons — at most five each, one point
each in as many words as it needs, concrete. "Fast" is not a pro; "no extra hop, keeps p99 under
the 200 ms partner budget" is. A con every option shares is context, not a con — hoist it into
Context.

## Phase 4 — Write

Template and the worked example are in REFERENCE.md. Shape:

```
# NNNN — <decision, stated as a decision>
Status · Date · (Supersedes/Superseded by)
## Context        — ≤5 sentences or bullets: forces, constraints, what breaks today
## Options        — table, or one short block per option with pros/cons
## Decision       — the chosen option and the one force that decided it
## Consequences   — what this now costs us, what it forecloses, what to watch
```

Diagram only when the **shape** is the finding — a message flow, a boundary move, a new hop.
Mermaid if the repo already renders it, ASCII otherwise; under ~15 nodes. A diagram that restates
the prose is deleted.

Present tense, states what is true. No narration of how the document or the investigation
progressed, no grading of anyone's input, no rhetorical closers.

**A finding that lands mid-write rewrites its section.** Delete the superseded claim and the
reasoning that supported it, then state the new one as if it were always the answer. Never bolt the
correction on — no "Update:", no "however, further investigation showed", no "originally we
considered", no struck-through line kept for the record. The reader gets the current answer only;
the trail of how it moved belongs in chat, not in the file. Same rule when reopening an ADR still
in `proposed`. Once **accepted**, the decision is frozen and change means a new ADR (see
REFERENCE.md).

## Phase 5 — Land

Write the file, print the path, and say in one line what the next step is (usually: turn the
accepted ADR into an implementation plan). Do not start implementing.

## Anti-patterns

- An ADR that is a plan: file lists, steps, estimates, "then we update X".
- Three options where two were real and one is a strawman.
- Pros/cons as adjectives with no number, limit or failure mode behind them.
- Context that recounts the investigation instead of stating the forces.
- A diagram that restates the prose, or one nobody can read at 15+ nodes.
- Writing an ADR for a reversible, unsurprising change because it was asked for reflexively.
- Inventing `docs/adr/` next to an existing `docs/decisions/`.
- Mentioning earlier drafts, corrections, or what the conversation concluded.
- Asking where the file goes, or what to number it, instead of deciding.
- A superseded claim left in place with an "Update:" under it.
- Notes instead of prose: fragments, arrows, dropped articles — short, but the reader has to
  rebuild the argument.
- Padding: a sentence that states no force, trade-off or consequence.
- A force or cost dropped to make the ADR shorter.
