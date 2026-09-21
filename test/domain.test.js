import test from 'node:test';
import assert from 'node:assert';
import {
  createGroup,
  addExpense,
  getExpenses,
  calculateBalances,
  calculateSettlement,
  InvalidInputError,
} from '../src/domain.js';

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

const TRIP = ['Asha', 'Rahul', 'Meera'];

// The seeded fixture: Hotel ₹9,000 paid by Asha, Dinner ₹4,500 paid by Rahul, both split
// equally three ways. 3000/1500 against 9000/4500 leaves +450000, 0, -450000.
function seededTrip() {
  const hotel = addExpense(tripGroup(), {
    description: 'Hotel',
    amountPaise: 900000,
    payerId: 'Asha',
    splitMemberIds: TRIP,
  });
  return addExpense(hotel, {
    description: 'Dinner',
    amountPaise: 450000,
    payerId: 'Rahul',
    splitMemberIds: TRIP,
  });
}

test('calculateBalances on the seeded Goa trip returns Asha +450000, Rahul 0, Meera -450000', () => {
  const balances = calculateBalances(seededTrip());
  assert.deepStrictEqual(balances, [
    { memberId: 'Asha', paise: 450000 },
    { memberId: 'Rahul', paise: 0 },
    { memberId: 'Meera', paise: -450000 },
  ]);
  // Project.md: per-group balances always net to zero. Asserted here as well as inside
  // the function so a future change that weakens the guard still fails this test.
  assert.strictEqual(balances.reduce((sum, b) => sum + b.paise, 0), 0);
});

test('calculateBalances on a group with no expenses returns zero for every member in order', () => {
  assert.deepStrictEqual(calculateBalances(tripGroup()), [
    { memberId: 'Asha', paise: 0 },
    { memberId: 'Rahul', paise: 0 },
    { memberId: 'Meera', paise: 0 },
  ]);
});

// ₹100 split three ways is 34/33/33. The member who paid is owed the two paise the other
// two did not take, so the balances are 6666/-3333/-3333 — still exactly zero.
test('calculateBalances sums to exactly zero when the split has a remainder', () => {
  const group = addExpense(tripGroup(), {
    description: 'Lunch',
    amountPaise: 10000,
    payerId: 'Asha',
    splitMemberIds: TRIP,
  });
  const balances = calculateBalances(group);
  assert.deepStrictEqual(balances, [
    { memberId: 'Asha', paise: 6666 },
    { memberId: 'Rahul', paise: -3333 },
    { memberId: 'Meera', paise: -3333 },
  ]);
  assert.strictEqual(balances.reduce((sum, b) => sum + b.paise, 0), 0);
});

// AC-5: the public API cannot produce an unbalanced group — addExpense refuses an unknown
// payer or split member, and the split functions always hand out the whole amount — so the
// invariant is exercised with a hand-crafted group of the shape a corrupt or half-migrated
// store file would have: an expense that credits or debits an id the group no longer
// lists. The credit (or debit) lands on a member the projection drops, so the amounts no
// longer net to zero and the guard has to fire rather than settle a group on wrong numbers.
test('calculateBalances throws when an expense references a member outside the group', () => {
  const corrupt = [
    // A credit to a member who is not in `members`: the payer paid 1000 but only 500 of
    // the split lands on the group, leaving +500 unaccounted for.
    { payerId: 'Asha', splitMemberIds: ['Asha', 'Ghost'] },
    // The mirror image, so the guard is not keyed to one sign: the split debits 500 to a
    // member the group does not list and the payer's credit is dropped with it.
    { payerId: 'Ghost', splitMemberIds: ['Asha', 'Rahul'] },
  ];
  for (const expense of corrupt) {
    const group = {
      id: 'corrupt',
      name: 'Corrupt',
      members: [{ id: 'Asha', name: 'Asha' }, { id: 'Rahul', name: 'Rahul' }],
      expenses: [{ id: 'e1', description: 'Hotel', amountPaise: 1000, ...expense }],
      createdAt: new Date().toISOString(),
    };
    assert.throws(
      () => calculateBalances(group),
      /net to zero/,
      `accepted ${JSON.stringify(expense)} as a balanced group`,
    );
  }
});

test('calculateBalances handles equal-split and share-split expenses in the same group', () => {
  const hotel = addExpense(tripGroup(), {
    description: 'Hotel',
    amountPaise: 900000,
    payerId: 'Asha',
    splitMemberIds: TRIP,
  });
  const group = addExpense(hotel, {
    description: 'Big room',
    amountPaise: 600000,
    payerId: 'Meera',
    splitMemberIds: TRIP,
    shares: [
      { memberId: 'Asha', shares: 2 },
      { memberId: 'Rahul', shares: 1 },
      { memberId: 'Meera', shares: 1 },
    ],
  });

  // Asha 900000 - 300000 - 300000; Rahul -300000 - 150000; Meera -300000 - 150000 + 600000.
  const balances = calculateBalances(group);
  assert.deepStrictEqual(balances, [
    { memberId: 'Asha', paise: 300000 },
    { memberId: 'Rahul', paise: -450000 },
    { memberId: 'Meera', paise: 150000 },
  ]);
  assert.strictEqual(balances.reduce((sum, b) => sum + b.paise, 0), 0);
});

test('calculateSettlement on the seeded Goa balances returns exactly Meera pays Asha 450000', () => {
  const balances = calculateBalances(seededTrip());
  assert.deepStrictEqual(calculateSettlement(balances, tripGroup().members), [
    { from: 'Meera', to: 'Asha', amountPaise: 450000 },
  ]);
});

// Ties in both directions at once: two members at +1000 and two at -1000, listed so that
// insertion order and the direction of the sort disagree with the naive answer.
const TIED_BALANCES = [
  { memberId: 'Asha', paise: 1000 },
  { memberId: 'Rahul', paise: 1000 },
  { memberId: 'Meera', paise: -1000 },
  { memberId: 'Dev', paise: -1000 },
];

// AC-3: identical balances always produce an identical transfer list. Both the plain
// single-transfer case and the tie-heavy one, because a tie-break that depends on
// iteration order or on the host's sort implementation only shows up when there is a tie.
test('calculateSettlement is deterministic across 100 identical calls', () => {
  const members = createGroup({ name: 'Ties', members: ['Asha', 'Rahul', 'Meera', 'Dev'] }).members;
  const balanceSets = [
    calculateBalances(seededTrip()),
    TIED_BALANCES,
    [{ memberId: 'Asha', paise: -500 }, { memberId: 'Rahul', paise: 400 }, { memberId: 'Meera', paise: 100 }],
  ];

  for (const balances of balanceSets) {
    const golden = calculateSettlement(balances, members);
    for (let i = 0; i < 100; i += 1) {
      assert.deepStrictEqual(
        calculateSettlement(balances, members),
        golden,
        `run ${i} disagreed with the first on ${JSON.stringify(balances)}`,
      );
    }
  }
});

test('calculateSettlement tie-breaks equal magnitudes by member insertion order', () => {
  const members = createGroup({ name: 'Ties', members: ['Asha', 'Rahul', 'Meera', 'Dev'] }).members;
  assert.deepStrictEqual(calculateSettlement(TIED_BALANCES, members), [
    { from: 'Meera', to: 'Asha', amountPaise: 1000 },
    { from: 'Dev', to: 'Rahul', amountPaise: 1000 },
  ]);
});

test('calculateSettlement emits no zero-amount transfer and splits across two creditors', () => {
  const balances = [
    { memberId: 'Asha', paise: -500 },
    { memberId: 'Rahul', paise: 400 },
    { memberId: 'Meera', paise: 100 },
  ];
  const members = createGroup({ name: 'Split', members: ['Asha', 'Rahul', 'Meera'] }).members;
  const transfers = calculateSettlement(balances, members);

  // Exactly two: one per creditor. A third would have to be the 0 paise left over once
  // both creditors are whole, and the debtors are exhausted by then.
  assert.deepStrictEqual(transfers, [
    { from: 'Asha', to: 'Rahul', amountPaise: 400 },
    { from: 'Asha', to: 'Meera', amountPaise: 100 },
  ]);
});

test('calculateSettlement on all-zero balances returns an empty array', () => {
  const members = createGroup({ name: 'Even', members: ['Asha', 'Rahul'] }).members;
  assert.deepStrictEqual(
    calculateSettlement([{ memberId: 'Asha', paise: 0 }, { memberId: 'Rahul', paise: 0 }], members),
    [],
  );
  assert.deepStrictEqual(calculateSettlement([], members), []);
});

test('calculateSettlement on a single debtor and creditor returns exactly one transfer', () => {
  const members = createGroup({ name: 'Pair', members: ['Asha', 'Rahul'] }).members;
  assert.deepStrictEqual(
    calculateSettlement([{ memberId: 'Asha', paise: -2500 }, { memberId: 'Rahul', paise: 2500 }], members),
    [{ from: 'Asha', to: 'Rahul', amountPaise: 2500 }],
  );
});

// AC-6, as a property rather than a case: whatever the input, money only ever moves from
// a member who is down to a member who is up, and never in a zero amount. Checked over
// the outputs of every shape above so a future "shortcut" in the loop cannot pass the
// hand-written expectations while breaking the direction rule somewhere they miss.
test('every settlement transfer moves money from a net debtor to a net creditor', () => {
  const members = createGroup({ name: 'All', members: ['Asha', 'Rahul', 'Meera', 'Dev'] }).members;
  const balanceSets = [
    calculateBalances(seededTrip()),
    TIED_BALANCES,
    [{ memberId: 'Asha', paise: -500 }, { memberId: 'Rahul', paise: 400 }, { memberId: 'Meera', paise: 100 }],
    [{ memberId: 'Asha', paise: 300000 }, { memberId: 'Rahul', paise: -450000 }, { memberId: 'Meera', paise: 150000 }],
  ];

  for (const balances of balanceSets) {
    const net = new Map(balances.map((b) => [b.memberId, b.paise]));
    for (const transfer of calculateSettlement(balances, members)) {
      assert.ok(transfer.amountPaise > 0, `zero-amount transfer: ${JSON.stringify(transfer)}`);
      assert.ok(net.get(transfer.from) < 0, `${transfer.from} pays but is not a net debtor`);
      assert.ok(net.get(transfer.to) > 0, `${transfer.to} is paid but is not a net creditor`);
    }
  }
});
