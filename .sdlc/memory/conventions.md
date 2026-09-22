# Conventions

## Stack
- Node 20+ standard library only. Zero runtime dependencies.
- `node:http` server, no framework, no build step.
- `node:test` + `node:assert` — no test framework.

## Money
- Integer paise everywhere inside the system. Floats appear only at the UI display boundary.
- Splits distribute remainder one paise at a time in member insertion order (deterministic).
- `src/money.js` — pure functions, no I/O. `src/domain.js` — pure functions, no I/O.

## Server patterns
- JSON API with explicit error responses: `{ error: { code: '...', message: '...' } }`.
- Error codes: `INVALID_JSON`, `METHOD_NOT_ALLOWED`, `GROUP_NAME_TAKEN`, `BALANCES_INVARIANT`.
- Body size limit: 64 KB (returns 400 `INVALID_JSON`).
- Non-JSON primitives (`null`, `[]`, `"string"`, `123`) in POST bodies → 400 `INVALID_JSON`.

## Tests
- `node --test test/` is `sdlc:verify`.
- Unit tests for pure logic in `src/money.js` and `src/domain.js`.
- Integration tests boot the server on an ephemeral port.

## UI
- Single `public/index.html` with inline `<script>` — no bundler, no framework.
- Two views: `#view-create-group` and `#view-group` (toggled via `.hidden` class).
- Form errors clear immediately when the user corrects the invalid input (not only on next submit).

## PRs
- Conventional commit subject. Body lists what changed, why, and acceptance criteria.
