# QA environment notes

## App
- Single-currency (INR/paise) expense splitter for small groups.
- No auth, no login, no test accounts needed.
- `npm run sdlc:serve` → `node src/server.js` on port 3000.
- Persistence: JSON file (ephemeral per QA run; `bin/seed.js` writes fixtures).
- No `localStorage` — state is server-side in a JSON file.

## Endpoints
- Health: `GET /healthz` → 200 `{ status: 'ok' }`.
- Groups: `POST /api/groups`, `GET /api/groups`, `GET /api/groups/:id/balances`.
- Expenses: `POST /api/groups/:id/expenses`.

## Error responses
All API errors return `{ error: { code: '...', message: '...' } }` with appropriate HTTP status:

| Code | Status | Meaning |
|---|---|---|
| `INVALID_JSON` | 400 | Malformed JSON, non-object body, or body >64 KB |
| `GROUP_NAME_TAKEN` | 400 | Duplicate group name (case-insensitive, trimmed) |
| `METHOD_NOT_ALLOWED` | 405 | Wrong HTTP method for route |
| `BALANCES_INVARIANT` | 500 | Per-member balances don't net to zero (corrupt data) |

## Known flaky
_(none recorded yet)_
