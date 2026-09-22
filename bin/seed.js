#!/usr/bin/env node
import { createStore } from '../src/store.js';
import { createGroup, addExpense } from '../src/domain.js';

const store = createStore();

// Clear existing data
store.reset();

// Built through createGroup so the seed is held to the same rules as the live path. Hand-
// building the object here meant a rule added to createGroup — a name cap, a member-name
// rule — was silently bypassed by the seed, which would then write a group POST
// /api/groups could not have produced.
//
// createGroup assigns a random id, and the fixture needs a stable one for demos and tests
// to address, so it is overridden afterwards. That override is the only way this group
// differs from one the API would have created.
const group = {
  ...createGroup({ name: 'Goa trip', members: ['Asha', 'Rahul', 'Meera'] }),
  id: 'seed-goa',
};

const g1 = addExpense(group, {
  description: 'Hotel',
  amountPaise: 900000,
  payerId: 'Asha',
  splitMemberIds: ['Asha', 'Rahul', 'Meera'],
});

const g2 = addExpense(g1, {
  description: 'Dinner',
  amountPaise: 450000,
  payerId: 'Rahul',
  splitMemberIds: ['Asha', 'Rahul', 'Meera'],
});

const data = {};
data[g2.id] = g2;
store.save(data);

console.log(`Seed written to ${process.env.STORE_PATH || 'data/groups.json'}`);
