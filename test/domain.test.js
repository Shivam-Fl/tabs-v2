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
