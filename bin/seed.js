#!/usr/bin/env node
import { createStore } from '../src/store.js';
import { createGroup, addExpense } from '../src/domain.js';

const SEED_ID = 'seed-goa';
const SEED_NAME = 'Goa trip';
const FORCE = '--force';

const USAGE = `Usage: node bin/seed.js [--force]

Writes the "${SEED_NAME}" demo fixture into the store.

  (no options)  Existing groups are KEPT. The fixture is added alongside them, and an
                earlier fixture of the same id is replaced in place, so running this twice
                does not duplicate anything. If a DIFFERENT group is already named
                "${SEED_NAME}" nothing is written and this explains why.
  --force       DESTRUCTIVE. Every existing group is deleted first, so the store ends up
                holding the fixture and nothing else. There is no backup and no undo.
  -h, --help    Print this and exit 0 without touching the store.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = args.filter((a) => a !== FORCE);
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(' ')}`);
  console.error(USAGE);
  process.exit(2);
}
const force = args.includes(FORCE);
const target = process.env.STORE_PATH || 'data/groups.json';

// Built through createGroup so the seed is held to the same rules as the live path. Hand-
// building the object here meant a rule added to createGroup — a name cap, a member-name
// rule — was silently bypassed by the seed, which would then write a group POST
// /api/groups could not have produced.
//
// createGroup assigns a random id, and the fixture needs a stable one for demos and tests
// to address, so it is overridden afterwards. That override is the only way this group
// differs from one the API would have created.
const group = {
  ...createGroup({ name: SEED_NAME, members: ['Asha', 'Rahul', 'Meera'] }),
  id: SEED_ID,
};

const g1 = addExpense(group, {
  description: 'Hotel',
  amountPaise: 900000,
  payerId: 'Asha',
  splitMemberIds: ['Asha', 'Rahul', 'Meera'],
});

const fixture = addExpense(g1, {
  description: 'Dinner',
  amountPaise: 450000,
  payerId: 'Rahul',
  splitMemberIds: ['Asha', 'Rahul', 'Meera'],
});

const store = createStore();
if (force) {
  const existing = store.load();
  const removed = Object.keys(existing).length;
  store.reset();
  const data = {};
  data[SEED_ID] = fixture;
  store.save(data);
  console.log(`Wrote "${SEED_NAME}" to ${target} — deleted ${removed} existing group(s) (--force).`);
} else {
  console.log(`Seeding "${SEED_NAME}" into ${target} — existing groups are kept.`);
  const existing = store.load();
  // The API rejects a duplicate group name (GROUP_NAME_TAKEN) and compares names the way
  // src/server.js does — trimmed and case-folded. Merging a second "Goa trip" in beside an
  // existing one would write a store the API could not have produced, so nothing is
  // written at all in that case.
  const clash = Object.values(existing).find(
    (g) => g && g.id !== SEED_ID && typeof g.name === 'string'
      && g.name.trim().toLowerCase() === SEED_NAME.toLowerCase(),
  );
  if (clash) {
    console.log(`Not seeded: a group named "${SEED_NAME}" already exists (id ${clash.id}).`);
    console.log('Nothing was written and nothing was deleted. To delete it and write the fixture, re-run with --force.');
    process.exit(0);
  }
  const data = { ...existing, [SEED_ID]: fixture };
  store.save(data);
  console.log(`Wrote "${SEED_NAME}" (${SEED_ID}) to ${target} — ${Object.keys(existing).length} existing group(s) left in place.`);
}
