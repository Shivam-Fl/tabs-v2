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

/**
 * Split an amount of paise in proportion to per-member share counts.
 * Each member's base is floor(totalPaise * shares / sumShares); the paise lost to
 * rounding are handed out one at a time, in input order, so the total is exact.
 *
 * Members with a share of 0 stay in the output at paise 0 — they are part of the split
 * at nothing, which is what the caller asked for. They are also skipped when the
 * rounding paise are handed out: giving one to a member who was given no share turns
 * "owes nothing" into "owes 1 paise". The leftover is always smaller than the number of
 * members holding a non-zero share (each floor loses strictly less than 1 paise, so the
 * leftover is a whole number below that count), so there is always somewhere for it to go.
 */
export function splitByShares(totalPaise, shareEntries) {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new Error('totalPaise must be a non-negative integer');
  }
  if (!Array.isArray(shareEntries) || shareEntries.length === 0) {
    throw new Error('shareEntries must be a non-empty array');
  }

  const seen = new Set();
  let sumShares = 0;
  for (const entry of shareEntries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('each share entry must be an object with a memberId and shares');
    }
    const { memberId, shares } = entry;
    if (typeof memberId !== 'string') {
      throw new Error('share entry memberId must be a string');
    }
    if (!Number.isInteger(shares) || shares < 0) {
      throw new Error('share entry shares must be a non-negative integer');
    }
    if (seen.has(memberId)) {
      throw new Error('shareEntries must contain unique memberIds');
    }
    seen.add(memberId);
    sumShares += shares;
  }
  if (sumShares === 0) {
    throw new Error('at least one share must be greater than 0');
  }

  const bases = shareEntries.map((entry) =>
    Math.floor((totalPaise * entry.shares) / sumShares));
  let leftover = totalPaise - bases.reduce((sum, base) => sum + base, 0);

  return shareEntries.map((entry, i) => {
    const takesRoundingPaise = entry.shares > 0 && leftover > 0;
    if (takesRoundingPaise) leftover -= 1;
    return { memberId: entry.memberId, paise: bases[i] + (takesRoundingPaise ? 1 : 0) };
  });
}
