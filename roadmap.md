# Tabs — roadmap

Surveyed 2026-09-26 (second run). Rebuilt from `maintainer/issues.json`, `maintainer/pulls.json`
and `maintainer/closed.json` — four open issues, two open pull requests, nine issues closed on
2026-09-21 and 2026-09-22. The last roadmap on this branch is `maintainer/roadmap.md`; it was
written before this survey's predecessor filed #22 and #23, and this one is corrected against
that rather than copied from it. No issue in the list is marked `untrusted`; all four are the
pipeline's own.

## Shipped

What a person can do in the app today that they could not before:

- Create a group with named members, record an expense split equally between them, and get
  the state back after a reload. Groups live in one JSON file beside the server.
- Split an expense by custom shares instead of equally, in proportion to each member's share
  count. A member with zero shares is left out of the split.
- See every member's net balance, and the fewest transfers that settle the group — computed
  greedily with a stable tie-break, so the same balances always give the same transfers.
- Mark a settlement transfer as done: balances update, the done state survives a reload, and
  marking the same transfer twice is rejected (409) rather than double-counted.
- Record two expenses, or two settlements, at the same moment without losing one. The
  write-path ordering bug behind that is in `.sdlc/memory/patterns/`.
- Correct things without re-reading the manual: a form error clears as soon as the offending
  field is edited, a double-submitted create-group form does not create two groups, and a
  group name is compared case-insensitively with whitespace trimmed.
- Tests cover the money arithmetic, the domain, the store, the HTTP layer, and the stored-XSS
  payload at the server boundary. What they do **not** cover is the UI: nothing in `test/`
  executes `public/index.html`, so the escaping the UI relies on is asserted by a comment in
  the code, not by a test. That gap is #19, and #19 is stopped.

## In flight

Two pull requests are open, and only one of them is project work:

- **#24 — "fix: CHANGELOG has duplicate headings, no released section, and entries out of
  order"**, from `sdlc/issue-23`. This is #23's work in flight. `maintainer/pulls.json` says
  nothing about which stage it is at, so that is not recorded here.
- **#25 — "memory: 2026-09-26"**, from `memory/2026-09-26`. The librarian's nightly run, not
  a ticket. Noted so the next run does not read it as unmerged work.

Nothing else is in flight. #19 and #21 are open and parked, both labelled `sdlc:needs-human`;
#22 is open and, as *Blocked* explains, cannot be built by a ticket at all. The two review
follow-ups (#8, #9) closed on 2026-09-21 and 2026-09-22 and left nothing open.

## Next

1. **Answer #21's architecture question, then split it.** The spec in `docs/spec/tabs.md`
   cannot be built on the current stack: it requires hosting on Vercel with no disk outliving
   a request, a managed database with migrations, and real accounts with every read and write
   checked against the group's members. `.sdlc/memory/project.md`, ADR-0001 and ADR-0004 say
   the opposite — a Node server over a JSON file, zero dependencies, no login. None of the
   spec's five steps in *Order of work* can be planned until that conflict is settled, because
   every piece is designed against the answer. It is also the item that unblocks a human
   rather than an agent, which is the tie-breaker when two things are otherwise equal.
2. **Land #19 before any migration, not after.** It is a browser test of the UI, the HTTP
   API, the store and the domain together — and the migration in #21 rewrites all four. Its
   value is highest against the architecture that exists now; built afterwards it is a test of
   a different app. This is the one ordering judgement here that is not visible from either
   issue alone.
3. **The three issues filed this survey** — keyboard access to the whole UI, a health
   endpoint that can actually fail, and a seed command that destroys real data. They are the
   only real defects in shipped code that no open ticket covers, and none of them needs a
   decision from anyone: they can be built and reviewed now, whatever #21 decides. They are
   also the whole of the remaining unblocked work, which is worth knowing: the rest of the
   backlog is waiting on a person.

## Blocked, and on whom

- **#21 — on the repository owner.** Labelled both `sdlc:epic` and `sdlc:needs-human`, so
  nothing will split it unattended. The decision it needs is the database, auth and sessions,
  how the app runs on Vercel, and how existing groups, expenses and settlement move onto
  them. An epic split against a decision nobody has made produces issues that all get
  replanned, so it is deliberately not being split on the spec's authority. Two smaller
  questions ride along and are worth answering in the same breath: whether remainder
  distribution stays in member insertion order once shares are no longer the only split, and
  whether the `INR only` open question in `project.md` is settled by the spec's per-group
  currency.
- **#22 — on the librarian, and it is misfiled.** Its whole deliverable is a change to
  `.sdlc/memory/project.md`, and no ticket branch may write there: the guard reserves all of
  `.sdlc/memory/**` on every ticket branch, whatever `forbidden_paths` says. It will sit at
  plan indefinitely, because the plan is correct and the work is not permitted. Its factual
  half — the `Stubbed for now` section, which says all four commands are `exit 0` and which
  every command has outgrown — is a librarian's job, and its contested half is #21's. This
  survey's predecessor filed it; recorded here so nobody waits on it, and nothing is filed
  against it now.
- **#19 — on a human, twice over.** Stopped at `sdlc:plan-review` since 2026-09-22, four
  days, and also labelled `sdlc:needs-human`. Its own body says the empty `verify.e2e` slot
  in `.sdlc/config.yml` is where the test would run, and that file is in `forbidden_paths`;
  `package.json` is not, so wiring the run into `sdlc:verify` is not the blocker — the
  browser driver is. Whichever way that goes, a driver or the QA agent's existing browser, a
  person has to make the call against ADR-0001's zero-dependency rule.
- **The pipeline's environment — on a human, later, not now.** `env.mode: compose`,
  `boot: npm run sdlc:serve`, `qa_auth.mode: none` and a `localhost:*` URL allowlist all
  describe an app with no login on a local port. The moment #21's accounts land, QA has
  nothing it can drive. Not filed as work: the right value for each depends on the hosting
  answer, and the file is forbidden anyway. Named so it is not discovered by a failing QA run.
- **Credentials and services — on nobody yet.** The spec needs a managed database, a password
  hash, an email provider for password reset, and environment variables for all of them, each
  documented in the README. None of that exists, and the reset flow is explicitly allowed to
  degrade rather than fail. This becomes real at step 1 of *Order of work*.

## Epics, and what waits on what

- **#21 Make Tabs a Splitwise-class product** (`sdlc:epic`) — open, not started, not split,
  no dependencies, and nothing waits on it. `docs/spec/tabs.md` is the numbered spec its body
  refers to, and the body is its plan for splitting. It carries no `Covers:` line, and there
  are no `TR-` ids to name one with: this repository has no `docs/trd.md` and no
  `.sdlc/memory/spec-index.json`, so `docs/spec/tabs.md` is the only numbered
  requirements list there is, and #21 is the only thing tracking it.

The graph has one node, so there is no edge to write down and no `epic_links` were filed. No
new epic was filed this survey: the only epic-shaped work is #21, and the three issues found
are each one work order. Splitting the spec's five steps into five epics now would be a
backlog written against an architecture nobody has chosen.

## What memory should say

Not filed as an issue — no ticket branch may write `.sdlc/memory/**`, and a change to a
memory file is not a deliverable any of them can carry. Recorded here because the librarian
and every planner read this file.

- `.sdlc/memory/conventions.md` lists seven error codes. `src/server.js` also emits
  `GROUP_NOT_FOUND` (404) and `NOT_FOUND` (404) on the routes it does not know, and
  `INTERNAL` (500) for anything uncaught. Same gap in
  `.sdlc/memory/qa/environment.md`, whose endpoint list omits
  `GET /api/groups/:id/expenses`, `GET /api/groups/:id/settlement` and
  `POST /api/groups/:id/settlements` — three of the five routes the group screen depends on.
- `.sdlc/memory/qa/environment.md` documents `GET /healthz` correctly as far as it goes, and
  that is the problem: it does not say the endpoint never touches the store, so a reader
  takes it for a readiness check. Filed as an issue instead, against the code.
- `project.md`'s `Stubbed for now` section is false — see #22. Its `## Commands` list is
  right; the section under it is not.
