# verify-claims — reference

## Collecting

```bash
gh pr view <n> --json number,title,body,headRefName,baseRefName,state,files,additions,deletions
gh pr diff <n> > "$SCRATCH/pr<n>.diff"
```

Use the session scratchpad, not `/tmp`. Diffs run to tens of KB — save, then `sed -n 'A,Bp'` the
sections you need.

Index a saved diff:

```bash
awk '/^diff --git/{print NR": "$0}' "$SCRATCH/pr60.diff"
```

`awk` over **several** files reports cumulative `NR`; index one file at a time or subtract the
previous file's length.

Stack order comes from `baseRefName`: a PR whose base is another PR's `headRefName` sits on top.
`A -> B -> C` means C contains everything.

## Acceptance criteria

Sourcing, in order — stop at the first that yields something.

```bash
gh pr view <n> --json body,commits --jq '.body, (.commits[].messageHeadline)'
```

Grep that output for issue references: `#\d+`, `[A-Z][A-Z0-9]+-\d+`, `atlassian.net/browse/`.

| Tracker | Fetch |
|---|---|
| GitHub issue | `gh issue view <n> --json title,body` |
| Jira | Atlassian MCP `getJiraIssue`, or the browse URL |
| Neither | the PR body's own "Acceptance criteria" / checklist section |
| Nothing at all | ask the user; if they say none exist, skip the axis and say so |

Never derive criteria from the diff. Criteria read off the code under review pass against it by
construction, and the report then certifies nothing.

Normalise into numbered, individually checkable statements:

```
AC1  A reservation cancelled inside the free-cancellation window refunds in full.
AC2  Outside the window, the refund is the deposit minus the platform fee.
AC3  Either outcome emits ReservationRefunded with the computed amount.
```

A criterion spanning two behaviours splits into two rows. One verdict per row.

## Conformance sweep

Static. No worktree, no build, no test run. Search the whole repo at the tip of the stack — a
criterion satisfied by untouched code is Met, not Missing.

```bash
git grep -n "<domain term from the criterion>" -- '<src glob>'
git grep -n "<event or method name the criterion implies>"
```

Then read the control flow that decides it, the same way Phase 2 reads a claim's chain.

Verdicts: **Met** · **Partial** · **Missing** · **Wrong** · **Untestable** · **Unclaimed**. Every
criterion gets exactly one, with `path:line` for anything other than Missing.

The two verdicts the Evidence axis cannot reach:

- **Missing** — nothing was claimed about it, so there is no assertion for Phase 4 to falsify.
- **Scope creep** — behaviour in the diff no criterion asked for. Medium at most, unless it changes
  live behaviour.

## Worktree — only when a move escalates to its running form

Reading needs none of this. Set it up only when Phase 4 cannot settle a claim statically and the
environment can build. Never review in the user's checkout.

```bash
git fetch origin <headRefA> <headRefB>
git worktree add "$SCRATCH/prwt" origin/<headRef-of-tip>
```

Gotchas:

- `git worktree remove` fails with `Unable to read current working directory` when the shell is
  inside the worktree. Run it from the repo root.
- `rm -rf` in a compound command often trips permission prompts; let `git worktree remove --force`
  do the deletion.
- Confirm cleanup: `git worktree list` and `git status --porcelain` back at the repo root.

## Build and test — running forms only

Check the toolchain exists before promising a run: `dotnet --version`, `node -v`, `uv --version`,
`go version`. Absent, or no network for a restore → the claim is **Unsettled**, not failed. Say
which command was unavailable.

| Ecosystem | Build | Test one project/suite |
|---|---|---|
| .NET | `dotnet build <proj>.csproj -v q --nologo` | `dotnet test <proj>.csproj --nologo -v q` |
| Node | `npm ci` | `npx vitest run <path>` / `npx jest <path>` |
| Python | `uv sync` | `uv run pytest <path> -q` |
| Go | `go build ./...` | `go test ./<pkg> -run <Name>` |

`dotnet build` takes **one** project per invocation (`MSB1008` otherwise). `-v n` (normal) prints
per-test names, needed to see which test failed; `-v q` prints only the summary line.

## The three moves

Each has a reading form (default, portable) and a running form (escalation). Every running form
restores the file afterwards with `git checkout HEAD -- <path>`.

### Reading forms

Index the diff's hunks per file, then ask which of them a test's assertions actually depend on.

```bash
git diff <base>...<head> --unified=0 -- <source path> | grep -n '^@@'   # changed line ranges
git diff <base>...<head> --stat                                        # hunk attribution per PR
```

- **A (read).** Take each assertion in the new test, follow it to the production line it observes,
  and check that line number against the ranges above. No overlap → the test passes on the old code
  and does not cover the bug it names. Verdict **Reasoned**, citing both line numbers.
- **B (read).** Locate the construct the guard forbids and the point at which the guard evaluates.
  A guard evaluated at construction cannot catch a violation that only materialises at first use;
  a condition the fixture's state never reaches is inert. Verdict **Reasoned**, citing the guard
  line and the fixture line.
- **C (read).** Attribute hunks to PRs via each branch's `git log --oneline -- <path>`, then map the
  tip PR's new tests onto them. A test depending only on the parent's hunks was already covered.

Reading is inconclusive when the path is dynamic — reflection, DI-resolved implementations, a
config value read at runtime, generated code. That is the signal to escalate, and the only one.

### Running forms


**Move A — new test vs. old code.** Does the new test actually cover the bug?

```bash
git checkout <base-ref> -- path/to/Source.cs     # pre-change source, new tests intact
dotnet test <tests>.csproj --nologo -v n | grep -E "Passed!|Failed!|Failed "
git checkout HEAD -- path/to/Source.cs
```

Expect the new test to **fail**. It passes → it does not cover what its name says.

**Move B — does the guard guard?** Reintroduce what the test forbids, in the source, then re-run.

```bash
python3 - <<'EOF'
p='path/to/Source.cs'
s=open(p).read()
old="""<exact block the PR changed, both ends anchored>"""
new="""<the pre-PR form>"""
assert old in s, "anchor missing"
open(p,'w').write(s.replace(old,new,1))
EOF
```

Anchor both ends and `assert` before writing — never slice to end of file. Then re-run; still green
means the guard is inert.

**Move C — which PR in the stack does the work?**

```bash
git worktree add "$SCRATCH/prwt" origin/<tip-branch>
git checkout origin/<parent-branch> -- path/to/Shared.cs
dotnet test <tests>.csproj --nologo -v n | grep -E "Passed!|Failed!|Failed "
```

The tests that fail are exactly what the tip PR adds. Everything green was already covered — or is
not covered at all.

## Checking a third-party claim

Only to decide whether the repo-side code is built on a true premise. The fix is always repo-side.

```bash
ls ~/.nuget/packages/<pkg>/                       # installed versions
ilspycmd -t <Namespace>.<Type>\`2 ~/.nuget/packages/<pkg>/<ver>/lib/<tfm>/<Asm>.dll > out.cs
grep -n "<method>\|throw new\|catch (" out.cs
```

Node: read `node_modules/<pkg>/dist/*.js`. Python: `python -c "import x, inspect; print(inspect.getsourcefile(x))"`.
Go: `go doc -src <pkg>.<Sym>`.

Two questions worth answering this way: does the library actually throw/wrap/validate where the PR
says it does, and does it do so at the moment the PR's test exercises (construction vs. first use).
Validation that only fires at runtime cannot be covered by a constructor test.

## Report template

GitHub-flavoured markdown, paste-ready into a PR comment. **One screen.** The author reads this
between meetings; a report they skim is a report that changes nothing.

````markdown
**Conformance** — 2/4 criteria met, 1 met but untested; AC3 partial, a zero refund never emits the event.
**Evidence** — 5/6 claims hold; the regression guard is inert.

| # | Criterion | Verdict | Where |
|---|---|---|---|
| AC1 | Cancelling inside the free window refunds the full amount. | Met · Reasoned | `Refunds/Processor.cs:41` |
| AC2 | Outside the window, the refund is the deposit minus the platform fee. | Met · Reasoned | `Refunds/Processor.cs:63` |
| AC3 | Either outcome emits `ReservationRefunded` with the computed amount. | **Partial** · Reasoned | `Refunds/Processor.cs:88` |
| AC4 | A refund below the minimum is rejected before any charge is attempted. | Unclaimed · Reasoned | `Refunds/Processor.cs:52`, no test |

## Conformance

### 1. AC3 event not emitted on a zero refund · Reasoned
`src/Refunds/Processor.cs`

> AC3: "Either outcome emits `ReservationRefunded` with the computed amount."

`:88` returns as soon as the amount is zero, so the full-refund path publishes and the zero path
does not. Publish before the early return.

## Evidence

### 1. Regression guard is inert · Reasoned
`tests/Refunds/ProcessorTests.cs`

The guard at `:32` evaluates in the constructor, but the construct it forbids is only rejected at
first use — `Processor.cs:143`. *(that gating is `Foo.Bar`'s, not ours — nothing to fix on their
side).* Move the assertion into a test that calls `Process`.

> [!WARNING]
> A revert of `Processor.cs:143` ships green: nothing in the suite exercises the path.

*Settled by reading; suite not run (no .NET SDK in this environment). Move A run would confirm
finding 1.*
````

Rules that keep it short:

- Two verdict lines, then the table, then findings. Nothing before the verdict lines.
- One heading per finding, path alone beneath it, **three lines of prose at most**. No `**Issue:**`
  / `**Fix:**` scaffolding — labels double the length and the sentences already carry the roles.
- The fix is the last sentence of the finding, imperative, one line.
- Conformance findings quote the criterion as a blockquote. Evidence findings quote nothing.
- Heading names the defect (`Guard doesn't guard`), not the area (`Test coverage`), and ends with
  how it was settled: `· Proven` or `· Reasoned`.
- Bare line refs inside prose (`:88`), never the path already above.
- The criteria table ships even when every row is Met — the Missing row only reads as a finding
  next to rows that are not. One sentence per criterion, up to about twenty words: a reviewer who
  has not opened the ticket should be able to judge the verdict from the row alone.
- One settlement line, italic, at the end: what ran, what was reasoned, what could not be settled
  and what would settle it. Not a table — the table was worth it when every row was a command.
- Plain arrows (`→`), not LaTeX. At most one `> [!WARNING]`.
- No overall verdict across axes, no summary paragraph, no "overall this looks good".

## Offering the unsettled runs

Goes in chat after the report, never inside the paste-ready comment — the author cannot run
anything, the user can. Only when something is actually Unsettled.

Per unsettled item: the command, the state it needs, and what it would settle.

```
A · dotnet test tests/Refunds --nologo -v n
    with `Processor.cs` at `git checkout <base> -- src/Refunds/Processor.cs`
    → confirms or kills finding 1 (test may not cover the bug it names)
```

The state line matters more than the command. "Run the tests" settles nothing; the whole value of
a move is the file that gets swapped first and restored after.

Fold accepted results back in: move those verdicts to **Proven**, reissue the report, and rewrite
the settlement line. A finding that a run *kills* comes out of the report entirely — say so rather
than quietly shrinking the list.

Declined, or the environment still cannot: the report stands unchanged. Do not re-ask, and do not
promote an unsettled claim to a finding on the strength of the reading alone unless the reading was
conclusive in the negative sense — "this test cannot fail on the old code" is a finding; "this test
might not fail" is not.

## Worked example (condensed)

Stacked pair fixing a Kafka consumer that stopped polling permanently.

- **Claim** (PR A): "failed offset store during revoke leaves a stale entry; the *next* flush cycle
  then throws uncaught and kills the loop."
- **Located**: the loop's `catch` classifies exceptions; the revoke handler runs inside the poll
  call. The library stores a handler exception and rethrows the *original object* from the next
  poll — so it never reaches the `ConsumeException` branch. First failure is already fatal. Chain
  broken at link one.
- **Move C**: hunk attribution showed B's new test asserting on a line only B changed — reading
  alone gave the answer. The run (A's source over B's branch → 162/163, B's test the only failure)
  was confirmation, not the finding.
- **Move B (read)**: the library validates at first rebalance, not at construction — so four ctor
  tests named "regression guard" cannot reach the state they forbid. Verdict Reasoned from
  `Builder.cs:61` against the library's validation point; the later run confirmed it, all four
  green on the reverted lambda.
- **Reduced**: A's wrong mechanism and its vacuous test are *fixed by B* → dropped. Three live
  findings kept: an integration test that passes without exercising its fault, the inert ctor
  guard, and a README verification step reading configured intent rather than negotiated state.
- **Reported**: two verdict lines, the criteria table, three Evidence findings of three lines each;
  one clause noting the library-side gating as not-ours; a closing italic line — two moves reasoned,
  one run, integration suite unsettled for want of a Docker daemon. Half a screen.

## Adapting to a non-PR target

Branch or commit range instead of a PR: claims come from commit subjects, test names and added
comments; the "base" for Move A, in either form, is the range's merge-base. No stack, so Phase 5
only ranks.

Acceptance criteria have no PR body to hide in — look at the branch name for a ticket key, then the
commit subjects, then ask. A branch with no reachable criteria runs Evidence only, and the report
says so rather than leaving the axis silently absent.

Everything else is unchanged.
