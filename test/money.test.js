import test from 'node:test';
import assert from 'node:assert';
import { splitEqual, splitByShares } from '../src/money.js';

test('splits evenly when divisible', () => {
  const result = splitEqual(900000, ['A', 'B', 'C']);
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 300000 },
    { memberId: 'B', paise: 300000 },
    { memberId: 'C', paise: 300000 },
  ]);
});

test('distributes remainder in input order — AC-3 golden case', () => {
  const result = splitEqual(10000, ['A', 'B', 'C']);
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 3334 },
    { memberId: 'B', paise: 3333 },
    { memberId: 'C', paise: 3333 },
  ]);
  const total = result.reduce((s, r) => s + r.paise, 0);
  assert.strictEqual(total, 10000);
});

test('small remainder: 10 paise / 3 = 4/3/3', () => {
  const result = splitEqual(10, ['A', 'B', 'C']);
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 4 },
    { memberId: 'B', paise: 3 },
    { memberId: 'C', paise: 3 },
  ]);
  const total = result.reduce((s, r) => s + r.paise, 0);
  assert.strictEqual(total, 10);
});

test('single member gets full amount', () => {
  const result = splitEqual(50000, ['Solo']);
  assert.deepStrictEqual(result, [{ memberId: 'Solo', paise: 50000 }]);
});

test('throws on non-integer paise', () => {
  assert.throws(() => splitEqual(100.5, ['A']), /non-negative integer/);
});

test('throws on negative paise', () => {
  assert.throws(() => splitEqual(-100, ['A']), /non-negative integer/);
});

test('throws on empty member list', () => {
  assert.throws(() => splitEqual(100, []), /non-empty array/);
});

test('throws on duplicate member ids', () => {
  assert.throws(() => splitEqual(100, ['A', 'A']), /unique/);
});

test('output always sums to input', () => {
  const cases = [
    [100, 1], [100, 2], [100, 3], [100, 7],
    [9999, 4], [1, 1], [0, 5],
    [1234567, 11],
  ];
  for (const [total, n] of cases) {
    const members = Array.from({ length: n }, (_, i) => `m${i}`);
    const result = splitEqual(total, members);
    const sum = result.reduce((s, r) => s + r.paise, 0);
    assert.strictEqual(sum, total, `sum mismatch for ${total}/${n}: got ${sum}`);
  }
});

test('zero paise splits to zero for all members', () => {
  const result = splitEqual(0, ['A', 'B', 'C']);
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 0 },
    { memberId: 'B', paise: 0 },
    { memberId: 'C', paise: 0 },
  ]);
});

function entries(pairs) {
  return pairs.map(([memberId, shares]) => ({ memberId, shares }));
}

// AC-1: ₹6,000 with shares 2:1:1 — the big-room case the ticket is written around.
test('splitByShares divides in proportion to the share counts', () => {
  const result = splitByShares(600000, entries([['Asha', 2], ['Rahul', 1], ['Meera', 1]]));
  assert.deepStrictEqual(result, [
    { memberId: 'Asha', paise: 300000 },
    { memberId: 'Rahul', paise: 150000 },
    { memberId: 'Meera', paise: 150000 },
  ]);
});

// AC-2: the invariant that keeps equal split and share split from drifting apart.
// Every total here leaves a remainder for at least one modulus, so a divergence in
// the distribution rule shows up as a deepStrictEqual failure rather than a silent one.
test('shares 1:1:1 reproduces splitEqual exactly', () => {
  const totals = [0, 1, 2, 7, 10, 100, 9999, 10000, 450000, 1234567];
  for (const total of totals) {
    const ids = ['A', 'B', 'C'];
    assert.deepStrictEqual(
      splitByShares(total, entries(ids.map((id) => [id, 1]))),
      splitEqual(total, ids),
      `1:1:1 diverged from splitEqual at ${total} paise`,
    );
  }
});

test('distributes the remainder in input order', () => {
  const result = splitByShares(10000, entries([['A', 1], ['B', 1], ['C', 1]]));
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 3334 },
    { memberId: 'B', paise: 3333 },
    { memberId: 'C', paise: 3333 },
  ]);
});

test('the remainder falls on the earliest members, not the largest shares', () => {
  // 100 paise at 1:2 is 33.33 and 66.67; the floors are 33 and 66, which sum to 99, so
  // one paise is left over and goes to A because A comes first — not to B, who has the
  // larger share. Input order is the rule splitEqual already uses.
  const result = splitByShares(100, entries([['A', 1], ['B', 2]]));
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 34 },
    { memberId: 'B', paise: 66 },
  ]);
});

test('a zero share takes nothing and absorbs no rounding paise', () => {
  // The QA script's 'Cab ₹500': Rahul 1, Meera 3, Asha 0.
  const result = splitByShares(50000, entries([['Rahul', 1], ['Meera', 3], ['Asha', 0]]));
  assert.deepStrictEqual(result, [
    { memberId: 'Rahul', paise: 12500 },
    { memberId: 'Meera', paise: 37500 },
    { memberId: 'Asha', paise: 0 },
  ]);
});

// AC-3: "a share of 0 excludes that member from the split (their per-member paise is
// 0, other members absorb the whole amount)". One paise split 0:1:1 leaves exactly one
// paise to hand out; handing it to the member who was given no share would make the
// zero-share member owe 1 paise, which is the opposite of what the criterion says.
test('a rounding paise skips a zero-share member listed first', () => {
  const result = splitByShares(1, entries([['A', 0], ['B', 1], ['C', 1]]));
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 0 },
    { memberId: 'B', paise: 1 },
    { memberId: 'C', paise: 0 },
  ]);
});

test('zero-share members stay in the output, in input order', () => {
  const result = splitByShares(300, entries([['A', 2], ['B', 0], ['C', 1]]));
  assert.deepStrictEqual(result, [
    { memberId: 'A', paise: 200 },
    { memberId: 'B', paise: 0 },
    { memberId: 'C', paise: 100 },
  ]);
});

// AC-2: the sum invariant, swept rather than spot-checked. Every vector has a total
// below, at and above the share sum so both the "leftover exists" and "divides exactly"
// branches are exercised, and every vector contains a zero share.
test('the result always sums to the total, for any shares and total', () => {
  const vectors = [
    [1], [1, 1], [1, 1, 1], [2, 1, 1], [1, 2], [0, 1, 1], [3, 0, 1], [5, 5, 5, 1], [7, 3],
  ];
  for (let total = 0; total <= 200; total++) {
    for (const shares of vectors) {
      const shareEntries = entries(shares.map((s, i) => [`m${i}`, s]));
      const result = splitByShares(total, shareEntries);

      assert.deepStrictEqual(
        result.map((r) => r.memberId),
        shareEntries.map((e) => e.memberId),
        `member order changed for ${total} / ${shares}`,
      );

      const sum = result.reduce((s, r) => s + r.paise, 0);
      assert.strictEqual(sum, total, `sum mismatch for ${total} / ${shares}: got ${sum}`);

      result.forEach((r, i) => {
        if (shares[i] === 0) {
          assert.strictEqual(r.paise, 0, `zero share was paid: ${total} / ${shares}`);
        }
        // Proportionality: every member gets their exact fractional entitlement rounded
        // down, or that plus the single rounding paise. Anything else (a member paid two
        // paise over their share, or one short) means the division is not proportional.
        // The bound is 1, not <1: 2 paise at 2:1:1 leaves one paise to place, and it
        // lands on the 2-share member, taking them from 1.0 to 2.0.
        const exact = (total * shares[i]) / shares.reduce((s, v) => s + v, 0);
        const floor = Math.floor(exact);
        assert.ok(
          r.paise === floor || r.paise === floor + 1,
          `${r.memberId} got ${r.paise}, expected ${floor} or ${floor + 1} (${total} / ${shares})`,
        );
      });
    }
  }
});

test('throws on non-integer or negative totalPaise', () => {
  assert.throws(() => splitByShares(100.5, entries([['A', 1]])), /non-negative integer/);
  assert.throws(() => splitByShares(-100, entries([['A', 1]])), /non-negative integer/);
  assert.throws(() => splitByShares('100', entries([['A', 1]])), /non-negative integer/);
});

test('throws on an empty shareEntries array', () => {
  assert.throws(() => splitByShares(100, []), /non-empty array/);
});

test('throws on a share that is negative, fractional or not a number', () => {
  assert.throws(() => splitByShares(100, entries([['A', -1]])), /non-negative integer/);
  assert.throws(() => splitByShares(100, entries([['A', 1.5]])), /non-negative integer/);
  assert.throws(() => splitByShares(100, entries([['A', '2']])), /non-negative integer/);
  assert.throws(() => splitByShares(100, entries([['A', null]])), /non-negative integer/);
});

test('throws on a missing share field or a non-string memberId', () => {
  assert.throws(() => splitByShares(100, [{ memberId: 'A' }]), /non-negative integer/);
  assert.throws(() => splitByShares(100, [{ shares: 1 }]), /must be a string/);
  assert.throws(() => splitByShares(100, entries([[7, 1]])), /must be a string/);
});

test('throws on share entries that are not objects', () => {
  for (const bad of [null, undefined, [], 'A', 7, true]) {
    assert.throws(
      () => splitByShares(100, [bad]),
      /must be an object/,
      `accepted ${JSON.stringify(bad)} as a share entry`,
    );
  }
});

test('throws on duplicate memberIds in shareEntries', () => {
  assert.throws(
    () => splitByShares(100, entries([['A', 1], ['B', 1], ['A', 2]])),
    /unique/,
  );
});

test('throws when every share is 0', () => {
  assert.throws(
    () => splitByShares(100, entries([['A', 0], ['B', 0]])),
    /greater than 0/,
  );
});
