import test from 'node:test';
import assert from 'node:assert';
import { createGroup, addExpense, getExpenses, InvalidInputError } from '../src/domain.js';

test('createGroup assigns id, preserves member order, sets createdAt', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob', 'Charlie'] });
  assert.ok(group.id);
  assert.strictEqual(group.name, 'Test');
  assert.deepStrictEqual(group.members.map((m) => m.id), ['Alice', 'Bob', 'Charlie']);
  assert.ok(group.createdAt);
  assert.deepStrictEqual(group.expenses, []);
});

test('addExpense returns new group with expense appended, original unchanged', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  const updated = addExpense(group, {
    description: 'Lunch',
    amountPaise: 5000,
    payerId: 'Alice',
    splitMemberIds: ['Alice', 'Bob'],
  });
  assert.strictEqual(group.expenses.length, 0);
  assert.strictEqual(updated.expenses.length, 1);
  assert.strictEqual(updated.expenses[0].description, 'Lunch');
  assert.strictEqual(updated.expenses[0].amountPaise, 5000);
});

test('getExpenses returns expenses in insertion order', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  const g1 = addExpense(group, {
    description: 'First',
    amountPaise: 1000,
    payerId: 'Alice',
    splitMemberIds: ['Alice', 'Bob'],
  });
  const g2 = addExpense(g1, {
    description: 'Second',
    amountPaise: 2000,
    payerId: 'Bob',
    splitMemberIds: ['Alice', 'Bob'],
  });
  const expenses = getExpenses(g2);
  assert.strictEqual(expenses.length, 2);
  assert.strictEqual(expenses[0].description, 'First');
  assert.strictEqual(expenses[1].description, 'Second');
});

test('rejects empty description', () => {
  const group = createGroup({ name: 'Test', members: ['Alice'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: '',
        amountPaise: 100,
        payerId: 'Alice',
        splitMemberIds: ['Alice'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'DESCRIPTION_REQUIRED',
  );
});

test('rejects non-numeric amount', () => {
  const group = createGroup({ name: 'Test', members: ['Alice'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 'abc',
        payerId: 'Alice',
        splitMemberIds: ['Alice'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'AMOUNT_INVALID',
  );
});

test('rejects negative amount', () => {
  const group = createGroup({ name: 'Test', members: ['Alice'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: -500,
        payerId: 'Alice',
        splitMemberIds: ['Alice'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'AMOUNT_INVALID',
  );
});

test('rejects zero amount', () => {
  const group = createGroup({ name: 'Test', members: ['Alice'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 0,
        payerId: 'Alice',
        splitMemberIds: ['Alice'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'AMOUNT_INVALID',
  );
});

test('rejects unknown payerId', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 1000,
        payerId: 'Unknown',
        splitMemberIds: ['Alice', 'Bob'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'PAYER_UNKNOWN',
  );
});

test('rejects empty split list', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 1000,
        payerId: 'Alice',
        splitMemberIds: [],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SPLIT_REQUIRED',
  );
});

test('rejects duplicate split members', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 1000,
        payerId: 'Alice',
        splitMemberIds: ['Alice', 'Alice'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SPLIT_MEMBER_DUPLICATE',
  );
});

test('rejects a non-string member', () => {
  assert.throws(
    () => createGroup({ name: 'Test', members: [{ name: 'Alice' }] }),
    (err) => err instanceof InvalidInputError && err.code === 'MEMBER_NAME_REQUIRED',
  );
});

test('rejects split containing a non-member', () => {
  const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
  assert.throws(
    () =>
      addExpense(group, {
        description: 'Lunch',
        amountPaise: 1000,
        payerId: 'Alice',
        splitMemberIds: ['Alice', 'Stranger'],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SPLIT_MEMBER_UNKNOWN',
  );
});

function tripGroup() {
  return createGroup({ name: 'Goa trip', members: ['Asha', 'Rahul', 'Meera'] });
}

const BIG_ROOM = {
  description: 'Big room',
  amountPaise: 600000,
  payerId: 'Asha',
  splitMemberIds: ['Asha', 'Rahul', 'Meera'],
};

test('addExpense with shares stores splitShares and keeps splitMemberIds', () => {
  const updated = addExpense(tripGroup(), {
    ...BIG_ROOM,
    shares: [{ memberId: 'Asha', shares: 2 }, { memberId: 'Rahul', shares: 1 }, { memberId: 'Meera', shares: 1 }],
  });
  const exp = updated.expenses[0];
  assert.deepStrictEqual(exp.splitShares, [
    { memberId: 'Asha', shares: 2 },
    { memberId: 'Rahul', shares: 1 },
    { memberId: 'Meera', shares: 1 },
  ]);
  assert.deepStrictEqual(exp.splitMemberIds, ['Asha', 'Rahul', 'Meera']);
});

test('addExpense copies shares rather than keeping the caller array', () => {
  const shares = [{ memberId: 'Asha', shares: 2 }, { memberId: 'Rahul', shares: 2 }];
  const updated = addExpense(tripGroup(), {
    ...BIG_ROOM,
    splitMemberIds: ['Asha', 'Rahul'],
    shares,
  });
  shares[0].shares = 99;
  assert.strictEqual(updated.expenses[0].splitShares[0].shares, 2);
});

// AC-4: an equal-split expense has to stay byte-identical, which means the key must be
// absent — `splitShares: undefined` would still show up in a JSON.stringify and in
// Object.keys, and the GET handler's truthiness branch would be reading a key that
// every expense now has.
test('addExpense without shares adds no splitShares key at all', () => {
  const updated = addExpense(tripGroup(), BIG_ROOM);
  const exp = updated.expenses[0];
  assert.ok(!('splitShares' in exp), 'equal-split expense grew a splitShares key');
  assert.deepStrictEqual(Object.keys(exp), [
    'id', 'description', 'amountPaise', 'payerId', 'splitMemberIds', 'createdAt',
  ]);
});

test('addExpense rejects a non-array shares field with SHARES_INVALID', () => {
  for (const bad of [null, 'shares', 3, {}]) {
    assert.throws(
      () => addExpense(tripGroup(), { ...BIG_ROOM, shares: bad }),
      (err) => err instanceof InvalidInputError && err.code === 'SHARES_INVALID',
      `accepted ${JSON.stringify(bad)} as shares`,
    );
  }
});

test('addExpense rejects a share that is negative, fractional or the wrong shape', () => {
  for (const bad of [
    { memberId: 'Asha', shares: -1 },
    { memberId: 'Asha', shares: 1.5 },
    { memberId: 'Asha', shares: '2' },
    { memberId: 'Asha' },
    { shares: 1 },
    null,
    'Asha',
  ]) {
    assert.throws(
      () => addExpense(tripGroup(), { ...BIG_ROOM, shares: [bad] }),
      (err) => err instanceof InvalidInputError && err.code === 'SHARES_INVALID',
      `accepted ${JSON.stringify(bad)} as a share entry`,
    );
  }
});

test('addExpense rejects a share for a non-member with SHARES_MEMBER_UNKNOWN', () => {
  assert.throws(
    () =>
      addExpense(tripGroup(), {
        ...BIG_ROOM,
        shares: [{ memberId: 'Asha', shares: 1 }, { memberId: 'Stranger', shares: 1 }],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SHARES_MEMBER_UNKNOWN',
  );
});

test('addExpense rejects a share for a member outside the split with SHARES_NOT_IN_SPLIT', () => {
  assert.throws(
    () =>
      addExpense(tripGroup(), {
        ...BIG_ROOM,
        splitMemberIds: ['Asha', 'Rahul'],
        shares: [{ memberId: 'Asha', shares: 1 }, { memberId: 'Meera', shares: 1 }],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SHARES_NOT_IN_SPLIT',
  );
});

test('addExpense rejects duplicate share members with SHARES_MEMBER_DUPLICATE', () => {
  assert.throws(
    () =>
      addExpense(tripGroup(), {
        ...BIG_ROOM,
        shares: [{ memberId: 'Asha', shares: 1 }, { memberId: 'Asha', shares: 2 }],
      }),
    (err) => err instanceof InvalidInputError && err.code === 'SHARES_MEMBER_DUPLICATE',
  );
});

// AC-3: all-zero shares must be refused, whether they arrive as explicit zeroes or as
// no entries at all — both leave nothing to divide by.
test('addExpense rejects all-zero shares with SHARES_ALL_ZERO', () => {
  for (const shares of [
    [{ memberId: 'Asha', shares: 0 }, { memberId: 'Rahul', shares: 0 }],
    [{ memberId: 'Asha', shares: 0 }],
    [],
  ]) {
    const group = tripGroup();
    assert.throws(
      () => addExpense(group, { ...BIG_ROOM, shares }),
      (err) => err instanceof InvalidInputError && err.code === 'SHARES_ALL_ZERO',
      `accepted ${JSON.stringify(shares)} as shares`,
    );
    assert.strictEqual(group.expenses.length, 0, 'a rejected expense must not be written');
  }
});

test('addExpense accepts a single non-zero share among zeroes', () => {
  const updated = addExpense(tripGroup(), {
    ...BIG_ROOM,
    shares: [
      { memberId: 'Asha', shares: 0 },
      { memberId: 'Rahul', shares: 0 },
      { memberId: 'Meera', shares: 1 },
    ],
  });
  assert.deepStrictEqual(updated.expenses[0].splitShares[2], { memberId: 'Meera', shares: 1 });
});

// AC-10: JSON.parse accepts `null`, arrays, strings and numbers as valid JSON, and
// destructuring any of them raised a TypeError — which the server reported as a 500
// with the internal destructuring message instead of a 400. The boundary belongs
// here, next to the other input guards.
for (const [label, body] of [
  ['null', null],
  ['an array', []],
  ['a string', 'group'],
  ['a number', 123],
]) {
  test(`createGroup rejects ${label} with INVALID_JSON`, () => {
    assert.throws(
      () => createGroup(body),
      (err) => err instanceof InvalidInputError && err.code === 'INVALID_JSON',
    );
  });
}

for (const [label, body] of [
  ['null', null],
  ['an array', []],
  ['a string', 'expense'],
  ['a number', 123],
]) {
  test(`addExpense rejects ${label} expense with INVALID_JSON`, () => {
    const group = createGroup({ name: 'Test', members: ['Alice', 'Bob'] });
    assert.throws(
      () => addExpense(group, body),
      (err) => err instanceof InvalidInputError && err.code === 'INVALID_JSON',
    );
    assert.strictEqual(group.expenses.length, 0, 'a rejected expense must not be written');
  });
}
