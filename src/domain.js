import crypto from 'node:crypto';
import { splitEqual, splitByShares } from './money.js';

export class InvalidInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InvalidInputError';
    this.code = code;
  }
}

// `null`, an array, a string and a number are all valid JSON, and destructuring any of
// them throws a TypeError that the server reports as a 500 with the destructuring
// message leaked to the client. Refuse them here so they leave as a 400 instead.
function requireObject(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InvalidInputError('INVALID_JSON', 'Request body must be a JSON object');
  }
}

export function createGroup(input) {
  requireObject(input);
  const { name, members } = input;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new InvalidInputError('NAME_REQUIRED', 'Group name is required');
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw new InvalidInputError('MEMBERS_REQUIRED', 'At least one member is required');
  }

  const memberIds = new Set();
  const groupMembers = members.map((m) => {
    // Fail closed: a non-string member used to be accepted and stored as its own
    // id, so `{name:'Asha'}` persisted a member whose id is an object.
    if (typeof m !== 'string' || m.trim() === '') {
      throw new InvalidInputError('MEMBER_NAME_REQUIRED', 'Member name cannot be empty');
    }
    const id = m.trim();
    if (memberIds.has(id)) {
      throw new InvalidInputError('MEMBER_DUPLICATE', `Duplicate member: ${id}`);
    }
    memberIds.add(id);
    return { id, name: id };
  });

  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    members: groupMembers,
    expenses: [],
    createdAt: new Date().toISOString(),
  };
}

export function addExpense(group, input) {
  requireObject(input);
  const { description, amountPaise, payerId, splitMemberIds, shares } = input;

  if (typeof description !== 'string' || description.trim() === '') {
    throw new InvalidInputError('DESCRIPTION_REQUIRED', 'Description is required');
  }
  if (
    !Number.isInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    throw new InvalidInputError('AMOUNT_INVALID', 'Amount must be a positive integer (paise)');
  }
  if (!group.members.some((m) => m.id === payerId)) {
    throw new InvalidInputError('PAYER_UNKNOWN', 'Payer is not a member of this group');
  }
  if (!Array.isArray(splitMemberIds) || splitMemberIds.length === 0) {
    throw new InvalidInputError('SPLIT_REQUIRED', 'At least one split member is required');
  }
  const seenSplitIds = new Set();
  for (const id of splitMemberIds) {
    if (!group.members.some((m) => m.id === id)) {
      throw new InvalidInputError(
        'SPLIT_MEMBER_UNKNOWN',
        `Split member "${id}" is not in this group`,
      );
    }
    // splitEqual rejects duplicates by throwing a plain Error, which the server
    // reports as a 500 and which would strand the expense in the store. Reject
    // them here, at the boundary, before anything is written.
    if (seenSplitIds.has(id)) {
      throw new InvalidInputError(
        'SPLIT_MEMBER_DUPLICATE',
        `Split member "${id}" is listed more than once`,
      );
    }
    seenSplitIds.add(id);
  }

  // `shares` is the optional share count per member; absent means equal split. It is
  // validated against the split list rather than on its own, because a share count for
  // a member who is not in the split would be divided by but never reported, and the
  // per-member paise would then not sum to the amount.
  let splitShares = null;
  if (shares !== undefined) {
    if (!Array.isArray(shares)) {
      throw new InvalidInputError(
        'SHARES_INVALID',
        'shares must be an array of {memberId, shares}',
      );
    }
    const seenShareIds = new Set();
    let sumShares = 0;
    for (const share of shares) {
      if (share === null || typeof share !== 'object' || Array.isArray(share)) {
        throw new InvalidInputError(
          'SHARES_INVALID',
          'Each share must be an object with a memberId and a shares count',
        );
      }
      const { memberId, shares: count } = share;
      if (typeof memberId !== 'string' || !Number.isInteger(count) || count < 0) {
        throw new InvalidInputError(
          'SHARES_INVALID',
          'Each share needs a memberId and a non-negative integer shares count',
        );
      }
      if (seenShareIds.has(memberId)) {
        throw new InvalidInputError(
          'SHARES_MEMBER_DUPLICATE',
          `Share member "${memberId}" is listed more than once`,
        );
      }
      seenShareIds.add(memberId);
      if (!group.members.some((m) => m.id === memberId)) {
        throw new InvalidInputError(
          'SHARES_MEMBER_UNKNOWN',
          `Share member "${memberId}" is not in this group`,
        );
      }
      if (!seenSplitIds.has(memberId)) {
        throw new InvalidInputError(
          'SHARES_NOT_IN_SPLIT',
          `Share member "${memberId}" is not in the split`,
        );
      }
      sumShares += count;
    }
    // Every share 0 (and an empty list, which sums the same way) leaves nothing to
    // divide by, so there is no split to record.
    if (sumShares === 0) {
      throw new InvalidInputError('SHARES_ALL_ZERO', 'At least one share must be greater than 0');
    }
    splitShares = shares.map((share) => ({ memberId: share.memberId, shares: share.shares }));
  }

  const newExpense = {
    id: crypto.randomUUID(),
    description: description.trim(),
    amountPaise,
    payerId,
    splitMemberIds: [...splitMemberIds],
    createdAt: new Date().toISOString(),
  };
  // Set only when the expense is a share split. Assigning the key unconditionally would
  // put `splitShares: null` on every equal-split expense, so the shape stored today would
  // change for expenses that have nothing to do with this mode.
  if (splitShares) newExpense.splitShares = splitShares;

  return {
    ...group,
    expenses: [...group.expenses, newExpense],
  };
}

export function getExpenses(group) {
  return [...group.expenses];
}

/**
 * Per-member balances for a group: paise paid minus paise owed, in `group.members`
 * order. Positive means the group owes them, negative means they owe the group.
 */
export function calculateBalances(group) {
  const balances = new Map(group.members.map((member) => [member.id, 0]));

  for (const expense of group.expenses) {
    balances.set(
      expense.payerId,
      (balances.get(expense.payerId) || 0) + expense.amountPaise,
    );
    // The shares are re-derived rather than read back from the expense, because the
    // stored shape keeps the split *inputs* (the member list, the share counts) and the
    // resulting paise only exist in the response. Re-deriving through money.js is also
    // what keeps the remainder distribution identical to the one the UI displayed.
    const shares = expense.splitShares
      ? splitByShares(expense.amountPaise, expense.splitShares)
      : splitEqual(expense.amountPaise, expense.splitMemberIds);
    for (const share of shares) {
      balances.set(share.memberId, (balances.get(share.memberId) || 0) - share.paise);
    }
  }

  const result = group.members.map((member) => ({
    memberId: member.id,
    paise: balances.get(member.id),
  }));

  // Every expense credits its payer with exactly the amount it debits the split, so this
  // total is zero for anything the API could have written. A non-zero total means an
  // expense credited or debited an id that `group.members` does not list, and the
  // projection above dropped it — the store has been edited or migrated wrongly. Fail
  // loudly (project.md: balances always net to zero): a settlement built on numbers that
  // do not add up sends real money the wrong way, which is worse than an error page.
  const sum = result.reduce((total, entry) => total + entry.paise, 0);
  if (sum !== 0) {
    throw new Error(`Balances do not net to zero: sum was ${sum} paise`);
  }
  return result;
}

/**
 * The transfers that clear the group: largest debtor pays largest creditor, repeatedly,
 * with equal magnitudes resolved by `members` insertion order (ADR-0003). Deterministic
 * on purpose — the same balances must always produce the same list, or nobody trusts it.
 */
export function calculateSettlement(balances, members) {
  const positions = new Map(members.map((member, index) => [member.id, index]));
  const remaining = new Map(balances.map((entry) => [entry.memberId, entry.paise]));

  // Recomputed every pass, not sorted once: a transfer can shrink the head of a list
  // below the next member's balance, so the leader has to be re-picked rather than
  // assumed. The comparator is a total order over distinct member ids, which is what
  // makes the result identical across runs and hosts.
  const sideByMagnitude = (sign) =>
    [...remaining.entries()]
      .filter(([, paise]) => (sign < 0 ? paise < 0 : paise > 0))
      .map(([memberId, paise]) => ({ memberId, paise }))
      .sort((a, b) => {
        const byMagnitude = Math.abs(b.paise) - Math.abs(a.paise);
        return byMagnitude !== 0
          ? byMagnitude
          : positions.get(a.memberId) - positions.get(b.memberId);
      });

  const transfers = [];
  for (;;) {
    const debtors = sideByMagnitude(-1);
    const creditors = sideByMagnitude(1);
    // Nothing left on one side clears the group: with balances that net to zero the two
    // sides run out together, and calculateBalances is what guarantees that.
    if (debtors.length === 0 || creditors.length === 0) break;

    const debtor = debtors[0];
    const creditor = creditors[0];
    // The lesser of the two magnitudes, and both sides are strictly non-zero above, so
    // this is always at least one paise — no transfer of nothing is ever recorded.
    const amountPaise = Math.min(-debtor.paise, creditor.paise);
    transfers.push({ from: debtor.memberId, to: creditor.memberId, amountPaise });
    remaining.set(debtor.memberId, debtor.paise + amountPaise);
    remaining.set(creditor.memberId, creditor.paise - amountPaise);
  }
  return transfers;
}
