# Project

Written by the project planner and approved by a human, once, before the first ticket was
planned. Every agent reads this before deciding anything — correct it here rather than
arguing with it in a ticket.

## What this is
Tabs: shared-expense tracking for small groups. A user creates a group with named members, records expenses (description, amount, payer, who it was split between) split equally or by shares, sees per-member balances, gets a minimal deterministic settlement ('Meera pays Asha ₹4,500'), and marks settlements done so balances update. Money is integer paise throughout; persistence is a JSON file; the app runs on Node 20+ standard library alone, served over node:http with a plain static UI. Deliberately no framework, no database, no login.

## Stack
Node.js 20+ standard library only: node:http server, static HTML/vanilla JS UI, JSON file persistence, node:test + node:assert for tests. No npm dependencies, no build step, no framework.

The issue mandates it: 'No dependencies. Node 20+ and the standard library. node:http, no framework, no build step. Persistence is a JSON file.' It also happens to fit this pipeline exactly — the whole domain risk is in money arithmetic and settlement, not in infrastructure; a zero-dependency stack means sdlc:verify is node --test, sdlc:serve is one node process, and QA in compose mode drives localhost:3000 with nothing to misconfigure. Every agent that reads project.md inherits a stack it cannot get wrong.

Rejected:
- **Express/Fastify + SQLite** — Explicitly forbidden by the issue. Also adds a dependency tree and a real database to a product whose entire state fits in one JSON document; QA would be testing infrastructure instead of bugs.
- **React/SPA frontend with a build step** — The UI is one screen's worth of forms and lists. A bundler, transpiler, and node_modules payload buy nothing here and make sdlc:serve slower and more fragile to boot in CI.
- **TypeScript** — Requires a compile step, which the issue forbids, and the codebase is small enough that JSDoc types plus node --test coverage carry the weight. Revisit only if the module count grows past what the brief describes.

## Architecture
One node process. A static UI in public/ talks JSON over HTTP to a node:http server in src/server.js. The server delegates to pure domain modules (money, domain) that never touch the network or filesystem, and persists group state through src/store.js, which reads and writes a single JSON file. Tests in test/ import the domain and store modules directly and exercise the server over a real socket. No external services; the data flow is browser -> HTTP -> domain -> JSON file, and back.

### Modules
- `src/money.js` — Integer-paise arithmetic and the split algorithms: equal split and share split, each distributing the remainder so shares always sum exactly to the expense amount. Pure functions, no I/O.
- `src/domain.js` — Group/expense model and the ledger logic: applying an expense, computing per-member balances, checking they net to zero, and deriving the deterministic greedy settlement (largest debtor pays largest creditor, stable tie-break). Pure functions, no I/O.
- `src/store.js` — Persistence: load/save the whole group collection to one JSON file with atomic write (tmp + rename), plus an in-memory mode for tests. The only module that touches the filesystem.
- `src/server.js` — node:http server: JSON API routes for groups, expenses, balances and settlements; serves the static UI; owns the listen port (3000) and the ready endpoint the pipeline polls.
- `public/` — Static HTML/CSS/vanilla JS UI. Renders groups, expense forms, balances and the settlement list; converts paise to rupees for display only — never does arithmetic in floats.
- `test/` — node:test suites. Unit tests for money splits (remainder, rounding edge cases) and settlement determinism; integration tests that boot the server on an ephemeral port and drive the HTTP API.

## Invariants
These hold for every ticket, whatever it asks for.

- Money is integer minor units (paise) everywhere inside the system; floats appear only at the UI display boundary, converting paise to a rupee string for rendering and parsing user input back to integers immediately.
- Every split of an expense sums back to exactly the expense amount: the remainder is distributed one paise at a time in a deterministic order, never rounded per-share.
- Settlement is deterministic: identical balances always produce the identical transfer list, computed greedily (largest debtor pays largest creditor) with a stable tie-break such as member insertion order.
- Per-group balances always net to zero; if they ever do not, the system reports an error loudly (HTTP 500 with a clear message, failing test) rather than papering over it.
- No runtime dependencies: Node 20+ standard library only. Adding any package to dependencies is a architecture-level change, not a ticket-level one.
- Marking a settlement as done is itself a ledger entry; balances are always derived from the full history of expenses and settlements, never mutated in place.

## Commands
- `sdlc:verify` — `node --test test/`
- `sdlc:serve` — `node src/server.js`
- `sdlc:seed` — `node bin/seed.js`
- `sdlc:ready` — `curl -sf http://localhost:3000/`

Stubbed for now:
- sdlc:verify is 'exit 0' until the first ticket lands src/money.js or src/domain.js with tests — the epic's money-logic-first ticket must replace the stub with 'node --test test/' and say so in its acceptance criteria.
- sdlc:serve is 'exit 0' until the first ticket lands src/server.js and public/; that ticket must replace the stub with 'node src/server.js' listening on port 3000, matching env.base_url in .sdlc/config.yml.
- sdlc:seed is 'exit 0' until src/store.js exists; the ticket that adds persistence should ship bin/seed.js writing a synthetic Goa-trip group so QA never needs real records.
- sdlc:ready is a stub until the server exists; then it polls GET / on localhost:3000, matching env.ready in .sdlc/config.yml.

## Deploy
No hosted deployment, deliberately. QA drives the compose-mode environment defined in .sdlc/config.yml: 'npm run sdlc:serve' boots the app on localhost:3000 inside the workflow runner, and the URL allowlist (localhost:*) matches. The JSON data file lives beside the process and is ephemeral per run, which seed fixtures cover. A public preview is not planned; if one is ever wanted it is a new issue, because the JSON-file store is the first thing a real deployment would replace.

## Open questions
- The issue's example is in rupees, so paise is the minor unit and INR the assumed single currency. If multi-currency groups are ever in scope, amount integers need a currency code alongside from day one — worth the maintainer confirming 'INR only' when splitting the epic.
- Remainder distribution order is specified as deterministic but not which member gets the extra paise; this brief picks member insertion order. If the maintainer prefers payer-first or largest-share-first, that is a one-line change in src/money.js plus golden-test updates.
