# Roadmap

Rebuilt 2026-09-22 from open issues, open PRs, and recently closed work.

## Shipped

A user can do all of this today, with nothing but Node 20+ installed:

- Create a named group and add members to it.
- Record an expense split equally between chosen members; remainders distribute rather
  than round (₹100 / 3 = 34 / 33 / 33, summing back to 100).
- Record an expense split by custom shares, with zero shares excluding a member.
- See each member's balance — what they are owed, what they owe, or even.
- See the deterministic greedy settlement — the fewest transfers that clear every debt,
  and the same balances always produce the same transfers.
- Mark a settlement transfer as done and have balances update to reflect it.
- State persists across page reloads via a JSON file on the server.

Invariants that were asked for in the founding brief and now hold in code:

- Money is integer paise end to end; floats only at the UI boundary.
- Balances net to zero; a violation returns `BALANCES_INVARIANT` (HTTP 500) from the
  server rather than being papered over.
- No dependencies beyond the Node 20+ standard library.
- Form errors clear as soon as the user edits the field they were about, instead of
  lingering until the next submit.
- Double-submit on the create-group form no longer creates duplicate groups with the
  same name.
- Two expenses added at the same time both persist; two settlements marked at the same
  time both save.

## In flight

Nothing. All open issues and open PRs are closed.

## Next

Two or three things that should happen after, with the reason each.

1. **A browser-level test of the money path.** There are 135 unit tests across the
   domain, money, store and server modules, and the QA environment is wired
   (`sdlc/config.yml`, `memory/qa/environment.md`, `memory/qa/selectors.md`,
   minimax-m3 assigned to the `qa` stage) — but there is no e2e test and
   `verify.e2e` is empty. The integration between UI, HTTP API, store and domain is
   untested at the level where the user actually touches it. Until there is one,
   every refactor that touches the UI-to-domain seam is a leap of faith, and money
   is the load-bearing invariant. This is one issue, not an epic: pick a tool, write
   the critical path (create group → add expense → see settlement → mark done), and
   wire it into the verify step.

That is the only thing I am confident is next. Everything else I could name — editing
expenses, deleting groups, exporting — is a product decision nobody has made yet, and
a roadmap entry for one is a wish, not a plan.

## Blocked, and on whom

Nothing blocked. No issue is waiting on a human decision, an external service, or a
credential.

## Epics

The founding epic (#1, "Build Tabs: record shared expenses and settle them in the
fewest transfers") is closed; every piece of it shipped. No open epics, and therefore
no dependency graph to draw yet.

When the next epic-sized body of work surfaces — when someone names a product
direction beyond the founding brief — it should be written as an epic rather than as
a list of issues, and the dependency graph section should be rebuilt at that point.
