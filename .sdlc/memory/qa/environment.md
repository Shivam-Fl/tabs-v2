# QA environment notes

## App
- Single-currency (INR/paise) expense splitter for small groups.
- No auth, no login, no test accounts needed.
- `npm run sdlc:serve` → `node src/server.js` on port 3000.
- Persistence: JSON file (ephemeral per QA run; `bin/seed.js` writes fixtures).
- No `localStorage` — state is server-side in a JSON file.

## Endpoints
- Health: `GET /healthz` → 200 `{ status: 'ok' }`.
- Groups: `GET /api/groups`, `POST /api/groups` (201).
- Expenses: `GET /api/groups/:id/expenses`, `POST /api/groups/:id/expenses` (201).
- Balances: `GET /api/groups/:id/balances` → `{ balances }`.
- Settlement: `GET /api/groups/:id/settlement` → `{ settlement, recorded }`; `POST /api/groups/:id/settlements` (201) → `{ settlement }`.

Two response shapes a UI test will trip over if it assumes otherwise:
- `GET /expenses` returns the **whole group** alongside the expenses, because the UI builds
  the payer select and every split checkbox from `group.members` — not from the expense list.
- `GET /settlement` returns **two** arrays, not one. `settlement` is the still-outstanding
  transfers; `recorded` is what has already been marked done, read off the group rather than
  derived from balances.

## Error responses
All API errors return `{ error: { code: '...', message: '...' } }`. Status comes from the
error's class, not the call site: every `InvalidInputError` thrown in `src/domain.js` becomes
**400**, `SettlementDuplicateError` becomes **409**, and the codes below that aren't validation
are raised explicitly in `src/server.js` with their own status.

| Code | Status | Meaning |
|---|---|---|
| `INVALID_JSON` | 400 | Malformed JSON, non-object body, or body >64 KB |
| `NAME_REQUIRED` | 400 | Group name empty after trim |
| `MEMBERS_REQUIRED` | 400 | Group created with no members |
| `MEMBER_NAME_REQUIRED` | 400 | A member name is empty |
| `MEMBER_DUPLICATE` | 400 | Same member listed twice in one create-group call |
| `GROUP_NAME_TAKEN` | 400 | Duplicate group name (case-insensitive, trimmed) |
| `DESCRIPTION_REQUIRED` | 400 | Expense description empty |
| `AMOUNT_INVALID` | 400 | Amount not a positive integer number of paise |
| `PAYER_UNKNOWN` | 400 | Payer is not a member of the group |
| `SPLIT_REQUIRED` | 400 | Expense split with no members selected |
| `SPLIT_MEMBER_UNKNOWN` | 400 | Split member is not in the group |
| `SPLIT_MEMBER_DUPLICATE` | 400 | Same split member listed twice |
| `SHARES_INVALID` | 400 | A share count is not a non-negative integer |
| `SHARES_ALL_ZERO` | 400 | Every share count is 0 |
| `SHARES_MEMBER_UNKNOWN` | 400 | Share given to a non-member |
| `SHARES_MEMBER_DUPLICATE` | 400 | Same member given shares twice |
| `SHARES_NOT_IN_SPLIT` | 400 | Shares given to a member not among the split members |
| `SETTLEMENT_MEMBER_UNKNOWN` | 400 | Settlement `from` or `to` is not a group member |
| `SETTLEMENT_SELF` | 400 | Settlement from/to is the same member |
| `SETTLEMENT_DUPLICATE` | 409 | Same (from, to, amountPaise) already recorded |
| `GROUP_NOT_FOUND` | 404 | No group with that id — **not** `NOT_FOUND` |
| `NOT_FOUND` | 404 | Unmatched path or method on an unmatched route |
| `METHOD_NOT_ALLOWED` | 405 | Right path, wrong HTTP method |
| `BALANCES_INVARIANT` | 500 | Per-member balances don't net to zero (corrupt data) |
| `INTERNAL` | 500 | Store read/write threw; message is the raw error |

`BALANCES_INVARIANT` deliberately comes back from `/settlement` as well as `/balances` — the
settlement is derived from the same balances, so the same corrupt group must not look like a
different failure depending on which URL it was read through.

## Known flaky
_(none recorded yet)_
