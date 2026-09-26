# Tabs

Shared expenses, settled in the fewest transfers.

Built by the [Automated AI SDLC](https://github.com/Shivam-Fl/automated-ai-sdlc) pipeline running entirely on open-weight models via OpenCode Go.

## Commands

| Command | What it does |
|---|---|
| `npm run sdlc:verify` | Runs the test suite (`node --test`). |
| `npm run sdlc:serve` | Serves the app on http://localhost:3000. |
| `npm run sdlc:seed` | Writes a demo group, "Goa trip", into the store. **Existing groups are kept** — the fixture is added alongside them. |
| `npm run sdlc:seed:force` | Same, but **deletes every existing group first**. Destructive, with no backup and no undo. |
| `npm run sdlc:ready` | Curl check that the server is answering. |

The store is a single JSON file — `data/groups.json`, or `$STORE_PATH` when that is set — and it is the whole of a Tabs installation. `npm run sdlc:seed` never deletes anything; if you want the store to hold the demo group and nothing else, run `npm run sdlc:seed:force`, which unlinks the file first. `node bin/seed.js --help` prints the same contract from the script itself.
