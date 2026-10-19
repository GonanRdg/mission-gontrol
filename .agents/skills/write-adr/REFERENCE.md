# write-adr — reference

## Decision test, judged examples

| Change | ADR? | Why |
|---|---|---|
| New REST endpoint on an existing controller | No | Reversible, unsurprising, no alternative worth recording |
| New nullable column + migration | No | Same |
| New config setting / feature flag | No | Same |
| Library bump, bug fix, refactor inside one class | No | Same |
| Add Kafka publishing alongside RabbitMQ | **Yes** | Contract + infra lock-in; dual-publish vs cut-over vs outbox strategy |
| Introduce a rate limiter for a shared upstream quota | **Yes** | Static split vs shared counter vs per-queue limiters; fail-open vs fail-closed |
| Store a payload as jsonb vs real columns | **Yes** | Migration cost to undo; query shape consequences |
| Cross-domain integration: events vs synchronous HTTP | **Yes** | Coupling decision, hard to walk back |
| Keyset vs offset pagination on a public API | **Yes** | Public contract |
| Split a bounded context out of the monolith | **Yes** | Boundary and ownership |
| Only one viable approach, with a real cost | **Yes, one option** | Record the forces and the accepted cost |

Borderline → apply the three gates literally. Two out of three is a no.

## Finding the convention

```bash
ls docs 2>/dev/null; cat .adr-dir 2>/dev/null
find . -maxdepth 4 -type d \( -iname adr -o -iname 'adr*' -o -iname decisions -o -iname architecture \) -not -path './.git/*'
find . -maxdepth 4 -type f -iregex '.*/[0-9]\{3,4\}[-_].*\.md' -not -path './.git/*' | sort | tail
grep -rli 'architecture decision record' --include='*.md' . | head
```

Read the **two most recent** ADRs, not the first. Copy from those: heading set, frontmatter keys,
numbering width (`0001` vs `001` vs `12`), slug style, date format, whether options are a table or
sections, mermaid vs ASCII vs none.

Next number = highest existing + 1. Numbers are never reused, including for superseded ADRs.

Nothing found → create `docs/adr/` and write `0001-<slug>.md`. Create it at the moment the first
ADR is written, never speculatively. Monorepo or multi-context repo:

```
docs/adr/                       ← system-wide decisions
packages/<context>/docs/adr/    ← decisions binding only that context
```

## Matching MADR or Nygard

MADR 4 is the common house template. When the repo uses it, keep its headings and frontmatter and
pour this skill's content into them — the caps in "Section caps" still apply.

| This skill | MADR 4 | Nygard |
|---|---|---|
| Context | Context and Problem Statement (+ optional Decision Drivers) | Context |
| Options | Considered Options + Pros and Cons of the Options | — (prose) |
| Decision | Decision Outcome | Decision |
| Consequences | Consequences (good / bad / neutral) | Consequences |
| Status line | `status` frontmatter | Status |

MADR frontmatter, all optional: `status`, `date`, `decision-makers`, `consulted`, `informed`.
Two MADR sections worth borrowing even outside MADR:

- **Decision Drivers** — 3–5 bullets of the criteria the options are judged on. Use it when the
  options table needs axes; otherwise the Context bullets already carry them.
- **Confirmation** — one line naming what *fails* if the code stops obeying this ADR: an
  architecture test, an integration test, an alert, a CI rule. It argues nothing about the choice;
  it makes the choice enforceable. `Architecture test fails the build on a project reference from
  Ordering to Billing.` Include it only when the decision claims a checkable property — a
  guarantee, a boundary, a limit. Skip it for naming, ownership and "we will not do X". Cannot be
  written in one line → the decision drivers are adjectives; fix those instead of padding here.

MADR's own "one paragraph is a valid ADR" stance holds here: when the decision is worth recording
but had one credible path, a title plus three sentences is the whole file. The template is a
ceiling, not a form to fill.

## Template

```md
# 0007 — Publish reservation events to Kafka via the transactional outbox

- **Status:** proposed
- **Date:** 2026-09-08

## Context

<≤5 sentences or bullets. The forces only:>
- What exists today and where it falls short, in numbers where numbers exist.
- The constraint that removes options (contract, quota, compliance, latency budget, team size).
- What breaks or stays broken if nothing changes.

## Options

### A. <name> — one sentence of what it is
**Pros:** <≤5, one point each, concrete>
**Cons:** <≤5, same>

### B. <name> — one sentence
**Pros:** …
**Cons:** …

<Or, when options compare on the same axes, a table:>

| | A. <name> | B. <name> |
|---|---|---|
| Delivery guarantee | at-least-once, outbox-backed | at-most-once |
| Ops surface | +1 relay process | none |
| Undo cost | drop the strategy | rewrite publishers |

## Decision

<Chosen option, then the single force that decided it, in as few sentences as that takes. If
one option only: the constraint that leaves no alternative, and the cost being accepted.>

## Consequences

- <What this now costs — ops, latency, money, a thing that must be monitored.>
- <What it forecloses, and what would have to be true to revisit.>
```

Optional, only when they earn their line: `Supersedes ADR-NNNN` / `Superseded by ADR-NNNN`,
`Deciders`, a link to the ticket or investigation.

## Section caps

| Section | Cap |
|---|---|
| Context | ≤5 sentences or bullets |
| Per option | 1 sentence + ≤5 pros + ≤5 cons |
| Decision | ≤5 sentences |
| Consequences | ≤5 bullets |

The caps are ceilings, not targets, and count ideas, not words. Most ADRs need fewer; a sentence
runs as long as its point needs.

| Cut | Keep |
|---|---|
| Context restated inside an option | Every force that rules an option in or out |
| An adjective with no number, limit or failure mode behind it | Every cost the decision accepts, even an awkward one |
| A sentence that repeats the previous one in other words | The *because* that links a force to the decision |
| A hedge that changes no decision | Terms a reader outside the team needs defined |
| Any account of how the investigation went | |

Short and unreadable is a worse failure than long and clear: a reader who cannot follow the
argument reopens the debate the ADR was written to close.

## Diagrams

Include one only when the shape is the point: message flow crossing a boundary, a new hop, an
ownership move, a state machine. Never for "service calls database".

- Repo already has mermaid in docs → mermaid.
- Otherwise ASCII in a fenced block; it renders anywhere, including in a terminal.
- ≤15 nodes. More than that means the ADR is carrying a design doc's load.
- Label edges with the thing that flows (`reservation.created`), not with verbs (`sends`).

```
 Reservations API ──write──▶ [ reservations ] ──┐
                            [ outbox      ] ◀──┘ same tx
                                   │
                            relay  │ poll
                                   ▼
                        Kafka  reservations.v1 ──▶ consumers
```

## Worked ADR (condensed)

```md
# 0007 — Publish reservation events to Kafka via the transactional outbox

- **Status:** accepted
- **Date:** 2026-09-08

## Context

Reservation events reach downstream services over RabbitMQ, in the same transaction as the write,
through the existing outbox. Two consumers now need replay and a schema registry, which RabbitMQ
does not give us. Kafka is already running for other domains. Publishing directly from the request
path would break atomicity: a committed reservation with no event, or an event for a rolled-back
write.

## Options

### A. Add a Kafka strategy to the existing outbox
**Pros:** atomicity unchanged; one relay to operate; RabbitMQ stays live during migration.
**Cons:** +1 relay hop, ~200 ms added publish latency; Avro schemas now a release-time concern.

### B. Publish to Kafka inline, keep RabbitMQ on the outbox
**Pros:** lowest latency; no new moving parts.
**Cons:** events can be lost or published for rolled-back writes; two failure models to reason about.

## Decision

Option A. Atomicity is the reason the outbox exists, and 200 ms of publish latency is invisible to
consumers that already poll.

## Consequences

- Relay lag becomes a monitored SLI; a stalled relay now silently delays two domains.
- Schema changes need a registry-compatible migration, so event contracts are release-gated.
- RabbitMQ publishing stays until consumers cut over; both paths emit the same payload meanwhile.
```

## Revising vs superseding

| ADR status | A new finding means |
|---|---|
| `proposed` | Rewrite the affected sections in place. Old claim and its reasoning are deleted, not annotated. |
| `accepted` | A new ADR. The old file changes on its status line only. |

Superseding: set `Superseded by ADR-NNNN` on the old, `Supersedes ADR-NNNN` on the new. The old
ADR's context and reasoning stay untouched — it is the record of what was true then.

## Non-PR / non-ticket input

A Slack thread, a pasted design debate, or a verbal ask works the same. What matters is that the
forces in Context are checkable in the repo or in a linked source. A force nobody can verify is an
assumption — label it as one in Context, or leave it out.
