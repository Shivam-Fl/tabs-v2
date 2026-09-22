import http from 'node:http';
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

function tripMembers() {
  return ['Asha', 'Rahul', 'Meera'];
}

async function createTrip(url, members = tripMembers()) {
  const { data } = await post('/api/groups', { name: 'Goa trip', members }, url);
  return data.group.id;
}

// AC-1, end to end over HTTP: 2:1:1 on ₹6,000.
test('POST with shares returns per-member paise matching the shares', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Big room',
      amountPaise: 600000,
      payerId: 'Asha',
      splitMemberIds: tripMembers(),
      shares: [
        { memberId: 'Asha', shares: 2 },
        { memberId: 'Rahul', shares: 1 },
        { memberId: 'Meera', shares: 1 },
      ],
    }, url);

    assert.strictEqual(status, 201);
    assert.deepStrictEqual(data.expense.shares, [
      { memberId: 'Asha', paise: 300000 },
      { memberId: 'Rahul', paise: 150000 },
      { memberId: 'Meera', paise: 150000 },
    ]);
    assert.strictEqual(
      data.expense.shares.reduce((s, sh) => s + sh.paise, 0),
      data.expense.amountPaise,
    );
  } finally {
    close();
  }
});

// AC-4: the equal-split expense added before the change must read back exactly as it
// did — same per-member paise, in the same order — alongside a share-split sibling.
test('GET returns share-split expenses and leaves equal-split ones unchanged', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    await post(`/api/groups/${groupId}/expenses`, {
      description: 'Dinner',
      amountPaise: 10000,
      payerId: 'Asha',
      splitMemberIds: tripMembers(),
    }, url);
    await post(`/api/groups/${groupId}/expenses`, {
      description: 'Big room',
      amountPaise: 600000,
      payerId: 'Asha',
      splitMemberIds: tripMembers(),
      shares: [
        { memberId: 'Asha', shares: 2 },
        { memberId: 'Rahul', shares: 1 },
        { memberId: 'Meera', shares: 1 },
      ],
    }, url);

    const { status, data } = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.expenses.length, 2);

    const [equal, shared] = data.expenses;
    assert.deepStrictEqual(equal.shares, [
      { memberId: 'Asha', paise: 3334 },
      { memberId: 'Rahul', paise: 3333 },
      { memberId: 'Meera', paise: 3333 },
    ]);
    assert.ok(!('splitShares' in equal), 'equal-split expense carries a splitShares key');
    assert.deepStrictEqual(shared.splitShares, [
      { memberId: 'Asha', shares: 2 },
      { memberId: 'Rahul', shares: 1 },
      { memberId: 'Meera', shares: 1 },
    ]);
    assert.deepStrictEqual(shared.shares, [
      { memberId: 'Asha', paise: 300000 },
      { memberId: 'Rahul', paise: 150000 },
      { memberId: 'Meera', paise: 150000 },
    ]);
  } finally {
    close();
  }
});

// AC-3: rejected share input writes nothing and the group still reads back cleanly.
test('POST with all-zero shares returns 400 SHARES_ALL_ZERO and writes nothing', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Big room',
      amountPaise: 600000,
      payerId: 'Asha',
      splitMemberIds: tripMembers(),
      shares: [
        { memberId: 'Asha', shares: 0 },
        { memberId: 'Rahul', shares: 0 },
        { memberId: 'Meera', shares: 0 },
      ],
    }, url);

    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'SHARES_ALL_ZERO');
    assert.strictEqual(store.load()[groupId].expenses.length, 0);
    const after = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(after.status, 200);
    assert.strictEqual(after.data.expenses.length, 0);
  } finally {
    close();
  }
});

test('POST with shares for a non-member returns 400 SHARES_MEMBER_UNKNOWN', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Big room',
      amountPaise: 600000,
      payerId: 'Asha',
      splitMemberIds: tripMembers(),
      shares: [
        { memberId: 'Asha', shares: 1 },
        { memberId: 'Stranger', shares: 1 },
      ],
    }, url);

    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, 'SHARES_MEMBER_UNKNOWN');
    assert.strictEqual(store.load()[groupId].expenses.length, 0);
  } finally {
    close();
  }
});

test('a share of 0 shows up as 0 paise over HTTP', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await post(`/api/groups/${groupId}/expenses`, {
      description: 'Cab',
      amountPaise: 50000,
      payerId: 'Rahul',
      splitMemberIds: ['Rahul', 'Meera', 'Asha'],
      shares: [
        { memberId: 'Rahul', shares: 1 },
        { memberId: 'Meera', shares: 3 },
        { memberId: 'Asha', shares: 0 },
      ],
    }, url);

    assert.strictEqual(status, 201);
    assert.deepStrictEqual(data.expense.shares, [
      { memberId: 'Rahul', paise: 12500 },
      { memberId: 'Meera', paise: 37500 },
      { memberId: 'Asha', paise: 0 },
    ]);
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

// The seeded fixture, over HTTP: Hotel ₹9,000 paid by Asha and Dinner ₹4,500 paid by
// Rahul, both split equally three ways.
async function seedTripExpenses(groupId, url) {
  await post(`/api/groups/${groupId}/expenses`, {
    description: 'Hotel',
    amountPaise: 900000,
    payerId: 'Asha',
    splitMemberIds: tripMembers(),
  }, url);
  await post(`/api/groups/${groupId}/expenses`, {
    description: 'Dinner',
    amountPaise: 450000,
    payerId: 'Rahul',
    splitMemberIds: tripMembers(),
  }, url);
}

test('GET /api/groups/:id/balances on a group with no expenses returns zeroes in member order', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await get(`/api/groups/${groupId}/balances`, url);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data.balances, [
      { memberId: 'Asha', paise: 0 },
      { memberId: 'Rahul', paise: 0 },
      { memberId: 'Meera', paise: 0 },
    ]);
  } finally {
    close();
  }
});

// AC-1 end to end: the numbers the group screen renders come from this response.
test('GET /api/groups/:id/balances after Hotel and Dinner returns +450000, 0, -450000', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    await seedTripExpenses(groupId, url);

    const { status, data } = await get(`/api/groups/${groupId}/balances`, url);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data.balances, [
      { memberId: 'Asha', paise: 450000 },
      { memberId: 'Rahul', paise: 0 },
      { memberId: 'Meera', paise: -450000 },
    ]);
    assert.strictEqual(data.balances.reduce((sum, b) => sum + b.paise, 0), 0);
  } finally {
    close();
  }
});

// AC-2 end to end: exactly one transfer, with no zero-amount line and nothing the other
// way round.
test('GET /api/groups/:id/settlement after Hotel and Dinner returns exactly Meera pays Asha', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    await seedTripExpenses(groupId, url);

    const { status, data } = await get(`/api/groups/${groupId}/settlement`, url);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data.settlement, [
      { from: 'Meera', to: 'Asha', amountPaise: 450000 },
    ]);
  } finally {
    close();
  }
});

// AC-4: a group with nothing in it is an empty settlement, not an error.
test('GET /api/groups/:id/settlement on a group with no expenses returns an empty list', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    const { status, data } = await get(`/api/groups/${groupId}/settlement`, url);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(data.settlement, []);
  } finally {
    close();
  }
});

test('the derived endpoints return 404 GROUP_NOT_FOUND for an unknown group', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    for (const resource of ['balances', 'settlement']) {
      const { status, data } = await get(`/api/groups/nonexistent-id/${resource}`, url);
      assert.strictEqual(status, 404, `/${resource} did not 404`);
      assert.strictEqual(data.error.code, 'GROUP_NOT_FOUND');
    }
  } finally {
    close();
  }
});

test('the derived endpoints refuse a non-GET method with 405', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    for (const resource of ['balances', 'settlement']) {
      const { status, data } = await post(`/api/groups/${groupId}/${resource}`, {}, url);
      assert.strictEqual(status, 405, `POST /${resource} was not refused`);
      assert.strictEqual(data.error.code, 'METHOD_NOT_ALLOWED');
    }
  } finally {
    close();
  }
});

// AC-5 over HTTP: the public API cannot write an unbalanced group, so the store is
// corrupted the way a bad migration or a hand-edited JSON file would corrupt it — an
// expense split against a member the group no longer lists. Both derived routes answer
// with the same code, because it is the same invariant failing and the client should not
// have to know which URL it read the bad data through.
test('the derived endpoints return 500 BALANCES_INVARIANT when the stored group is corrupt', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);
    await seedTripExpenses(groupId, url);

    const data = store.load();
    data[groupId].expenses[0].splitMemberIds = [...tripMembers(), 'Ghost'];
    store.save(data);

    for (const resource of ['balances', 'settlement']) {
      const { status, data: body } = await get(`/api/groups/${groupId}/${resource}`, url);
      assert.strictEqual(status, 500, `/${resource} did not report the broken invariant`);
      assert.strictEqual(body.error.code, 'BALANCES_INVARIANT');
      assert.match(body.error.message, /net to zero/);
    }
  } finally {
    close();
  }
});

// POSTs the headers, then the body a moment later, so the handler has already been
// entered and is parked on `await parseBody(req)` by the time the body lands.
//
// This is what makes the test below able to see the race at all. Two `fetch` calls in a
// `Promise.all` do not: on loopback the first request's body is read and its handler has
// left `parseBody` before the second connection's `request` event is even emitted, so the
// two handlers never overlap and the test passes against the unfixed code. Measured at
// 0/50 iterations caught that way, against 20/20 this way.
function postAfterHeaders(path, body, baseUrl, delayMs = 50) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
      },
    );
    req.on('error', reject);
    req.flushHeaders();
    setTimeout(() => req.end(payload), delayMs);
  });
}

// The finding from the review of #7: this handler read the store *before*
// `await parseBody(req)` and wrote it back after. Two requests therefore loaded the same
// snapshot, each appended its expense to its own copy, and the second save dropped the
// first — one expense gone, with a 201 for both. The load→modify→save span has to be
// synchronous, so nothing can run between the read and the write.
test('two overlapping POSTs to the same group both persist', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);

    const [first, second] = await Promise.all([
      postAfterHeaders(`/api/groups/${groupId}/expenses`, {
        description: 'Hotel-1',
        amountPaise: 600000,
        payerId: 'Asha',
        splitMemberIds: tripMembers(),
      }, url),
      postAfterHeaders(`/api/groups/${groupId}/expenses`, {
        description: 'Dinner-2',
        amountPaise: 450000,
        payerId: 'Rahul',
        splitMemberIds: tripMembers(),
      }, url),
    ]);
    assert.strictEqual(first.status, 201);
    assert.strictEqual(second.status, 201);

    const { status, data } = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(
      data.expenses.map((e) => e.description).sort(),
      ['Dinner-2', 'Hotel-1'],
      'a concurrent expense POST overwrote the other',
    );
  } finally {
    close();
  }
});

// The other half of the same finding: keeping both writes is not enough if the ledger
// they leave behind no longer adds up. The exact balances also prove *both* expenses
// landed rather than one having been written twice.
test('two overlapping expense POSTs still leave balances netting to zero', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const groupId = await createTrip(url);

    await Promise.all([
      postAfterHeaders(`/api/groups/${groupId}/expenses`, {
        description: 'Hotel-1',
        amountPaise: 600000,
        payerId: 'Asha',
        splitMemberIds: tripMembers(),
      }, url),
      postAfterHeaders(`/api/groups/${groupId}/expenses`, {
        description: 'Dinner-2',
        amountPaise: 450000,
        payerId: 'Rahul',
        splitMemberIds: tripMembers(),
      }, url),
    ]);

    const { status, data } = await get(`/api/groups/${groupId}/balances`, url);
    assert.strictEqual(status, 200);
    // Asha fronts 600000 and owes 200000 + 150000; Rahul fronts 450000 and owes the same;
    // Meera fronts nothing and owes 350000.
    assert.deepStrictEqual(data.balances, [
      { memberId: 'Asha', paise: 250000 },
      { memberId: 'Rahul', paise: 100000 },
      { memberId: 'Meera', paise: -350000 },
    ]);
    assert.strictEqual(data.balances.reduce((sum, b) => sum + b.paise, 0), 0);
  } finally {
    close();
  }
});

// Making the load→modify→save span synchronous means the body has to be read and parsed
// before the group is looked up, so a request that is both unparseable and aimed at an
// unknown group now reports the body (400) rather than the group (404). That is the whole
// of the precedence change: everything that parses still reaches the lookup, so the two
// requests either code was written for are answered exactly as before.
test('POST /api/groups/:id/expenses reads the body before it looks the group up', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const unparseable = await postRaw('/api/groups/nonexistent-id/expenses', '{"description":', url);
    assert.strictEqual(unparseable.status, 400);
    assert.strictEqual(unparseable.data.error.code, 'INVALID_JSON');

    // `null` is valid JSON, so it still gets as far as the lookup and is answered by the
    // group being missing. Moving this one to 400 as well would be a second behaviour
    // change, and this pins that it was not made.
    const nonObject = await postRaw('/api/groups/nonexistent-id/expenses', 'null', url);
    assert.strictEqual(nonObject.status, 404);
    assert.strictEqual(nonObject.data.error.code, 'GROUP_NOT_FOUND');

    const unknownGroup = await post('/api/groups/nonexistent-id/expenses', {
      description: 'Lunch',
      amountPaise: 500,
      payerId: 'Alice',
      splitMemberIds: ['Alice'],
    }, url);
    assert.strictEqual(unknownGroup.status, 404);
    assert.strictEqual(unknownGroup.data.error.code, 'GROUP_NOT_FOUND');

    const { data } = await get('/api/groups', url);
    assert.deepStrictEqual(data.groups, [], 'a rejected request wrote a group');
  } finally {
    close();
  }
});
