import test from 'node:test';
import assert from 'node:assert';
import { start } from '../src/server.js';
import { createStore } from '../src/store.js';

async function post(path, body, baseUrl) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path, baseUrl) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url);
  const data = await res.json();
  return { status: res.status, data };
}

test('POST /api/groups returns 201 with the new group', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { status, data } = await post('/api/groups', {
      name: 'Test Group',
      members: ['Alice', 'Bob'],
    }, url);
    assert.strictEqual(status, 201);
    assert.strictEqual(data.group.name, 'Test Group');
    assert.strictEqual(data.group.members.length, 2);
  } finally {
    close();
  }
});

test('GET /api/groups lists created groups', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    await post('/api/groups', { name: 'Group A', members: ['X'] }, url);
    await post('/api/groups', { name: 'Group B', members: ['Y'] }, url);
    const { status, data } = await get('/api/groups', url);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.groups.length, 2);
  } finally {
    close();
  }
});

test('POST /api/groups/:id/expenses returns 201 with the new expense', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice', 'Bob'],
    }, url);
    const groupId = groupData.group.id;

    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Hotel',
      amountPaise: 6000,
      payerId: 'Alice',
      splitMemberIds: ['Alice', 'Bob'],
    }, url);
    assert.strictEqual(status, 201);
    assert.strictEqual(data.expense.description, 'Hotel');
    assert.strictEqual(data.expense.amountPaise, 6000);
  } finally {
    close();
  }
});

test('GET /api/groups/:id/expenses lists expenses and shares sum to amountPaise', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice', 'Bob', 'Charlie'],
    }, url);
    const groupId = groupData.group.id;

    await post(`/api/groups/${groupId}/expenses`, {
      description: 'Taxi',
      amountPaise: 10000,
      payerId: 'Alice',
      splitMemberIds: ['Alice', 'Bob', 'Charlie'],
    }, url);

    const { status, data } = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.expenses.length, 1);
    const exp = data.expenses[0];
    const shareSum = exp.shares.reduce((s, sh) => s + sh.paise, 0);
    assert.strictEqual(shareSum, exp.amountPaise);
    // The group screen builds its payer select, split checkboxes and share
    // labels from group.members; without them the view cannot render at all.
    assert.ok(Array.isArray(data.group.members), 'group.members must be present');
    assert.deepStrictEqual(
      data.group.members.map((m) => m.id),
      ['Alice', 'Bob', 'Charlie'],
    );
    assert.deepStrictEqual(
      exp.shares.map((s) => s.memberId),
      ['Alice', 'Bob', 'Charlie'],
    );
  } finally {
    close();
  }
});

test('unknown group id returns 404', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { status } = await get('/api/groups/nonexistent-id/expenses', url);
    assert.strictEqual(status, 404);
  } finally {
    close();
  }
});

test('empty description returns 400 with code DESCRIPTION_REQUIRED', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice'],
    }, url);
    const { status, data } = await post(`/api/groups/${groupData.group.id}/expenses`, {
      description: '',
      amountPaise: 100,
      payerId: 'Alice',
      splitMemberIds: ['Alice'],
    }, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'DESCRIPTION_REQUIRED');
  } finally {
    close();
  }
});

test('negative amount returns 400 with code AMOUNT_INVALID', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice'],
    }, url);
    const { status, data } = await post(`/api/groups/${groupData.group.id}/expenses`, {
      description: 'Lunch',
      amountPaise: -500,
      payerId: 'Alice',
      splitMemberIds: ['Alice'],
    }, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'AMOUNT_INVALID');
  } finally {
    close();
  }
});

test('unknown payer returns 400 with code PAYER_UNKNOWN', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice'],
    }, url);
    const { status, data } = await post(`/api/groups/${groupData.group.id}/expenses`, {
      description: 'Lunch',
      amountPaise: 500,
      payerId: 'Unknown',
      splitMemberIds: ['Alice'],
    }, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'PAYER_UNKNOWN');
  } finally {
    close();
  }
});

test('empty split list returns 400 with code SPLIT_REQUIRED', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice', 'Bob'],
    }, url);
    const { status, data } = await post(`/api/groups/${groupData.group.id}/expenses`, {
      description: 'Lunch',
      amountPaise: 500,
      payerId: 'Alice',
      splitMemberIds: [],
    }, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'SPLIT_REQUIRED');
  } finally {
    close();
  }
});

test('duplicate split member returns 400 and writes nothing to the store', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice', 'Bob'],
    }, url);
    const groupId = groupData.group.id;

    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Lunch',
      amountPaise: 500,
      payerId: 'Alice',
      splitMemberIds: ['Alice', 'Alice'],
    }, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'SPLIT_MEMBER_DUPLICATE');

    // AC-4: rejected input must write nothing — and the group must still read
    // back cleanly rather than 500 on every subsequent request.
    assert.strictEqual(store.load()[groupId].expenses.length, 0);
    const after = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(after.status, 200);
    assert.strictEqual(after.data.expenses.length, 0);
  } finally {
    close();
  }
});

test('state persists across server restart when the same store is reused', async () => {
  const store = createStore({ memory: true });
  // First server
  let { close, url } = await start({ port: 0, store });
  await post('/api/groups', { name: 'Persist Test', members: ['X'] }, url);
  close();

  // Second server with same store
  ({ close, url } = await start({ port: 0, store }));
  try {
    const { status, data } = await get('/api/groups', url);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.groups.length, 1);
    assert.strictEqual(data.groups[0].name, 'Persist Test');
  } finally {
    close();
  }
});

test('GET /healthz returns 200', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { status, data } = await get('/healthz', url);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.status, 'ok');
  } finally {
    close();
  }
});

test('unknown route returns 404', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { status } = await get('/api/unknown', url);
    assert.strictEqual(status, 404);
  } finally {
    close();
  }
});
