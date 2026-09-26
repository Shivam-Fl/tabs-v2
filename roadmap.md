# Tabs — roadmap

Surveyed 2026-09-26. Rebuilt from `maintainer/issues.json`, `maintainer/pulls.json` and
`maintainer/closed.json`. Two open issues, no open pull requests, both open issues stopped on a
human. This is the first roadmap on this branch, so there was no last one to correct.

## Shipped

What a person can do in the app today, and could not before the last nine closed issues:

- Create a group with named members, record an expense split equally between them, and get the
  state back after a page reload. Groups are in a JSON file beside the server; anyone with a
  group's id can read and change it.
- Split an expense by custom shares instead of equally, proportional to each member's share
  count. A member with zero shares is left out of the split.
- See every member's net balance and the fewest transfers that settle the group, computed
  greedily with a stable tie-break.
- Mark a settlement transfer as done: balances update, the done state survives a reload, and
  marking the same transfer twice is rejected rather than double-counted.
- Record two expenses, or two settlements, at the same moment without losing one. The
  write-path ordering bug behind that is in `.sdlc/memory/patterns/`.
- Corrections behave: a form error clears as soon as the offending field is edited, a
  double-submitted create-group form does not create two groups, and a group name is compared
  case-insensitively with whitespace trimmed.
- 135 tests cover the money arithmetic, the domain, the store, the HTTP layer and XSS.

Not shipped, and not in flight: any browser-level test of the UI-to-domain seam. That is #19,
and it is stopped.

## In flight

Nothing is in flight. `maintainer/pulls.json` is empty — no branch is mid-build, and nothing is
waiting on CI, a review or a merge. Both open issues are parked:

- **#19 Browser-level test of the money path** — at `sdlc:plan-review` since 2026-09-22, four
  days, and also labelled `sdlc:needs-human`. No work order has moved it. Stalled on a decision,
  not on work: see *Blocked*.
- **#21 Make Tabs a Splitwise-class product** — an epic, opened 2026-09-25, not started and not
  split. A person's decision, not an agent's; see *Blocked*.

The two review follow-ups (#8, #9) closed on 2026-09-21 and 2026-09-22 and left nothing open.

## Next

1. **Settle #21's architecture question, then split it.** The spec in `docs/spec/tabs.md`
   cannot be built on the current stack: it requires hosting on Vercel with no disk outliving a
   request, a managed database with migrations, and real accounts with every read and write
   checked against the group's members. `.sdlc/memory/project.md` and ADR-0001 and ADR-0004 say
   the opposite — a Node server over a JSON file, zero dependencies, no login. Nothing in the
   spec's five-step *Order of work* can be planned until that conflict is decided, because each
   piece is designed against the answer. It is also the item that unblocks a human rather than
   an agent, which is the tie-breaker when two things are otherwise equal.
2. **Land #19 before the migration, not after.** It is a browser test of the UI, the HTTP API,
   the store and the domain together — and the migration in #21 rewrites all four. Its value is
   highest against the architecture that exists now; built afterwards it is a test of a
   different app. This is the one ordering judgement here that is not visible from either
   issue alone, and it is the reason to look at #19 before looking at anything else.
3. **Make the memory true again** (filed this survey): `project.md` still says the build
   commands are stubs, and still presents the JSON-file stack as settled policy. Every agent
   reads it before deciding anything, so it is worth fixing while the stack it describes is
   still what the code does.

## Blocked, and on whom

- **#21 — on the repository owner.** It is labelled both `sdlc:epic` and
  `sdlc:needs-human`, so nothing will split it unattended. The decision it needs is the
  database, auth and sessions, how the app runs on Vercel, and how existing groups, expenses and
  settlement move onto them. An epic split against a decision nobody has made produces issues
  that all get replanned, so this is deliberately not being split on the spec's authority.
  Two smaller questions ride along and are worth answering in the same breath: whether
  remainder distribution stays in member insertion order once shares are no longer the only
  split, and whether the `INR only` open question in `project.md` is now settled by the spec's
  per-group currency.
- **#19 — on a human, twice over.** It is stopped at plan-review. And its own body says the
  empty `verify.e2e` slot in `.sdlc/config.yml` is where the test would run — that file is in
  `forbidden_paths`, so no agent can fill it in. Whichever way the browser-driver question goes
  (a driver, or the QA agent's existing browser), a person has to make that edit.
- **The pipeline's environment — on a human, later, not now.** `env.mode: compose`,
  `boot: npm run sdlc:serve`, `qa_auth.mode: none` and a `localhost:*` URL allowlist all
  describe an app with no login on a local port. The moment #21's accounts land, QA has nothing
  it can drive. Not filed as work: the right value for each depends on the hosting answer, and
  the file is forbidden anyway. Named here so it is not discovered by a failing QA run.
- **Credentials and services — on nobody yet.** The spec needs a managed database, a password
  hash, an email provider for password reset and environment variables for all of them, each
  documented in the README. None of that exists, and the reset flow is explicitly allowed to
  degrade rather than fail. This becomes real at step 1 of the *Order of work*.

## Epics

- **#21 Make Tabs a Splitwise-class product** — open, not started, no dependencies, and
  nothing else waits on it. It is the whole forward direction: `docs/spec/tabs.md` (S-1 for the
  title, S-2..S-11 for its ten sections) is the numbered spec, and the epic's own body is its
  plan for splitting.

The graph has one node, so there is no edge to write down. No new epics were filed this survey,
deliberately: the spec's five steps are all inside #21, and the maintainer's rule is that a
survey writes an epic when work is next and bigger than one issue — not when a brief describes
months of product. Splitting #21 into five epics now would be a backlog written against an
architecture that has not been decided.

No `Depends on` between epics to record, and no epic links filed, because #21 is the only open
epic. The real ordering in this project is the one in *Next* — #19 before the migration — and it
is a judgement about issue #19, which the pipeline cannot park and does not need to.
