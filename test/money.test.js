import test from 'node:test';
import assert from 'node:assert';
import { splitEqual } from '../src/money.js';

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
