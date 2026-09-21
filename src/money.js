import fs from 'node:fs';
import path from 'node:path';

/**
 * Split an amount of paise equally among members.
 * When the amount doesn't divide evenly, the first `remainder` members
 * (in input order) each receive one extra paise so the total is exact.
 */
export function splitEqual(totalPaise, memberIds) {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new Error('totalPaise must be a non-negative integer');
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    throw new Error('memberIds must be a non-empty array');
  }
  const unique = new Set(memberIds);
  if (unique.size !== memberIds.length) {
    throw new Error('memberIds must contain unique values');
  }

  const n = memberIds.length;
  const base = Math.floor(totalPaise / n);
  const remainder = totalPaise - base * n;

  return memberIds.map((id, i) => ({
    memberId: id,
    paise: base + (i < remainder ? 1 : 0),
  }));
}
