import crypto from 'node:crypto';

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
