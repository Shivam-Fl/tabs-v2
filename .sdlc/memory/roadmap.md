# Roadmap

Rebuilt 2026-09-23 from open issues, open PRs, and recently closed work.

## Shipped

What a user can do now that they could not before:

- **Create a group** with a name and members. The server rejects duplicate names (case-insensitive, whitespace-trimmed), and rapid double-submit no longer creates duplicates.
- **Record an expense** split equally among selected members, with the remainder distributed so shares always sum back to the exact amount (₹100 / 3 = 34/33/33, never 33.33 three times).
- **Split an expense by custom shares** — assign each member a share count and divide proportionally. Zero shares exclude a member.
- **See per-member balances** — what each person is owed or owes, in integer paise, summing to zero.
- **See the deterministic settlement** — the fewest transfers that clear the group, computed greedily (largest debtor pays largest creditor) with stable tie-break. The same balances always produce the same transfers.
- **Mark a settlement as done** and see balances update. The done state survives a page reload. Attempting to mark the same settlement twice is rejected.
- **Persist state** across page reloads via a JSON file. Concurrent writes no longer lose data.
- **Form validation** — error messages clear as soon as the user edits the field they were about, instead of lingering until the next submit.

Version 0.1.2. 149 tests passing across domain, money, server, store, and XSS suites.

## In flight

Nothing. No open pull requests.

## Next

The two or three things that should happen after, with the reason:

1. **Browser-level e2e test of the money path** (#19) — because the money invariant (balances net to zero, splits sum to the expense, settlement is deterministic) is load-bearing and currently untested at the integration level. Every refactor touching the UI-to-domain seam is a leap of faith until this exists. The QA environment is wired (minimax-m3 on the `qa` stage, selectors documented in `memory/qa/selectors.md`); only the test itself is missing. This comes first because it validates the foundation before more features are added on top.

2. **Edit and delete expenses** — because users will inevitably record a wrong expense and have no way to fix it without deleting the group. This is the most-requested feature shape for an expense app, and the current append-only ledger makes it non-trivial (editing an expense changes balances and settlement; deleting one requires reversing its ledger entries). Worth an issue when the e2e test is green, so the feature can be built against a validated foundation.

3. **Multi-currency support** — because the project assumes INR-only from day one (amounts are integer paise, no currency code in the data model), and adding it later requires a migration. The project.md flags it as an open question. Not urgent — the product works for single-currency groups — but the data model decision should happen before the schema hardens further.

## Blocked, and on whom

Nothing genuinely blocked. Issue #19 (e2e test) is unblocked and ready to be picked up. The deferred features above are sequenced by dependency and risk, not blocked on external decisions or credentials.

## Epics

- **#1 Build Tabs: record shared expenses and settle them in the fewest transfers** — closed 2026-09-22. All four child issues (#3, #4, #5, #6) are done. This was the only epic; nothing waits on it.

No open epics. The dependency graph is empty.
