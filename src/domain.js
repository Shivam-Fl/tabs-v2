import crypto from 'node:crypto';

export class InvalidInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InvalidInputError';
    this.code = code;
  }
}

export function createGroup({ name, members }) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new InvalidInputError('NAME_REQUIRED', 'Group name is required');
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw new InvalidInputError('MEMBERS_REQUIRED', 'At least one member is required');
  }

  const memberIds = new Set();
  const groupMembers = members.map((m) => {
    const id = typeof m === 'string' ? m.trim() : m;
    if (!id) {
      throw new InvalidInputError('MEMBER_NAME_REQUIRED', 'Member name cannot be empty');
    }
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

export function addExpense(group, expense) {
  const { description, amountPaise, payerId, splitMemberIds } = expense;

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
  for (const id of splitMemberIds) {
    if (!group.members.some((m) => m.id === id)) {
      throw new InvalidInputError(
        'SPLIT_MEMBER_UNKNOWN',
        `Split member "${id}" is not in this group`,
      );
    }
  }

  const newExpense = {
    id: crypto.randomUUID(),
    description: description.trim(),
    amountPaise,
    payerId,
    splitMemberIds: [...splitMemberIds],
    createdAt: new Date().toISOString(),
  };

  return {
    ...group,
    expenses: [...group.expenses, newExpense],
  };
}

export function getExpenses(group) {
  return [...group.expenses];
}
