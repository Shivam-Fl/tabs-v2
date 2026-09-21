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

// AC-2: the client busy flag only covers one tab. Two tabs, a direct API call or a
// replayed request all reach the server, and `group.name` had no uniqueness constraint,
// so every one of them persisted another group with the same name.
test('POST /api/groups rejects a name that already exists, ignoring case and spacing', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const created = await post('/api/groups', {
      name: 'Goa Trip',
      members: ['Alice', 'Bob'],
    }, url);
    assert.strictEqual(created.status, 201);

    // Each of these is the same group name to a user, and the exact-match case is what a
    // triple submit sends; the other two are what a second tab or a scripted client sends.
    for (const name of ['Goa Trip', 'goa trip', '  Goa Trip  ']) {
      const { status, data } = await post('/api/groups', { name, members: ['Alice'] }, url);
      assert.strictEqual(status, 400, `"${name}" was accepted as a new group`);
      assert.strictEqual(data.error.code, 'GROUP_NAME_TAKEN');
      assert.strictEqual(data.error.message, 'A group with this name already exists');
    }

    const { data } = await get('/api/groups', url);
    assert.strictEqual(data.groups.length, 1, 'a rejected duplicate was written to the store');
    assert.strictEqual(store.load()[created.data.group.id].members.length, 2);
  } finally {
    close();
  }
});

test('POST /api/groups accepts a name that is merely similar to an existing one', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    await post('/api/groups', { name: 'Goa Trip', members: ['Alice'] }, url);

    // The check is equality after normalizing, not a prefix or substring match: a name
    // the user would read as a different group has to stay creatable.
    for (const name of ['Goa Trip 2', 'Goa', 'Trip']) {
      const { status, data } = await post('/api/groups', { name, members: ['Alice'] }, url);
      assert.strictEqual(status, 201, `"${name}" was wrongly rejected`);
      assert.strictEqual(data.group.name, name);
    }

    const { data } = await get('/api/groups', url);
    assert.strictEqual(data.groups.length, 4);
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

// Sends a body that is already a string, so cases like 'null' and '[]' reach the
// server as the JSON the client would actually send.
async function postRaw(path, rawBody, baseUrl) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
  const data = await res.json();
  return { status: res.status, data };
}

// AC-10: all of these are valid JSON and none of them is an object.
const NON_OBJECT_BODIES = ['null', '[]', '"string"', '123'];

for (const raw of NON_OBJECT_BODIES) {
  test(`POST /api/groups with body ${raw} returns 400 INVALID_JSON, not 500`, async () => {
    const store = createStore({ memory: true });
    const { close, url } = await start({ port: 0, store });
    try {
      const { status, data } = await postRaw('/api/groups', raw, url);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error.code, 'INVALID_JSON');
      // The old failure was a TypeError message leaking out under a 500.
      assert.doesNotMatch(data.error.message, /destructur/i);
      assert.deepStrictEqual(store.load(), {}, 'a rejected body must write nothing');
    } finally {
      close();
    }
  });
}

for (const raw of NON_OBJECT_BODIES) {
  test(`POST /api/groups/:id/expenses with body ${raw} returns 400 INVALID_JSON, not 500`, async () => {
    const store = createStore({ memory: true });
    const { close, url } = await start({ port: 0, store });
    try {
      const { data: groupData } = await post('/api/groups', {
        name: 'Trip',
        members: ['Alice', 'Bob'],
      }, url);
      const groupId = groupData.group.id;

      const { status, data } = await postRaw(`/api/groups/${groupId}/expenses`, raw, url);
      assert.strictEqual(status, 400);
      assert.strictEqual(data.error.code, 'INVALID_JSON');
      assert.strictEqual(store.load()[groupId].expenses.length, 0);
    } finally {
      close();
    }
  });
}

// AC-7: the oversized-body path called req.destroy(), which tore the socket down
// before the 400 could be written — the client got a connection close, so `fetch`
// rejected and there was no status to read at all.
const OVERSIZED_BODY = JSON.stringify({
  name: 'x'.repeat(70 * 1024),
  members: ['Alice'],
});

test('the oversized fixture is genuinely over the 64KB limit', () => {
  assert.ok(OVERSIZED_BODY.length > 64 * 1024);
});

test('POST /api/groups with an oversized body returns 400 INVALID_JSON, not a connection close', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { status, data } = await postRaw('/api/groups', OVERSIZED_BODY, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'INVALID_JSON');
    assert.deepStrictEqual(store.load(), {});
  } finally {
    close();
  }
});

test('POST /api/groups/:id/expenses with an oversized body returns 400 INVALID_JSON', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'Trip',
      members: ['Alice'],
    }, url);
    const groupId = groupData.group.id;

    const { status, data } = await postRaw(`/api/groups/${groupId}/expenses`, OVERSIZED_BODY, url);
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'INVALID_JSON');
    assert.strictEqual(store.load()[groupId].expenses.length, 0);
  } finally {
    close();
  }
});

test('the server still accepts a normal body after rejecting an oversized one', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    await postRaw('/api/groups', OVERSIZED_BODY, url);
    const { status } = await post('/api/groups', { name: 'After', members: ['Alice'] }, url);
    assert.strictEqual(status, 201);
  } finally {
    close();
  }
});
