#!/usr/bin/env node
import { createStore } from '../src/store.js';
import { addExpense } from '../src/domain.js';

const store = createStore();

// Clear existing data
store.reset();

const members = ['Asha', 'Rahul', 'Meera'];
const group = {
  id: 'seed-goa',
  name: 'Goa trip',
  members: members.map((m) => ({ id: m, name: m })),
  expenses: [],
  // Written even though it is empty, so the fixture has the same shape createGroup
  // produces. The fallback in the domain makes this unnecessary for correctness, but the
  // fixture is what QA reads, and it should not be the one group missing a ledger half.
  settlements: [],
  createdAt: new Date().toISOString(),
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
