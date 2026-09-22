# Changelog

## Unreleased

### Added

- See who owes what in a group — each member's balance (owed, even, or owes) and the
  fewest transfers needed to settle up.

### Fixed

- Adding two expenses at the same time no longer loses one — both are persisted and returned
  on the next fetch.

- Marking a settlement no longer gets silently dropped when two people record one at the same
  time — both are saved.

- Marking a settlement done now updates everyone's balances to reflect it, the done state
  survives a page reload, and attempting to mark the same settlement twice is rejected
  rather than double-counting it.

- Error messages on the expense form now clear as soon as you edit the field they were
  about, instead of lingering on screen until the next submit attempt.

- Rapidly submitting the create-group form no longer creates duplicate groups with the same
  name.

- The server now rejects a new group whose name matches an existing group when compared
  case-insensitively and with whitespace trimmed.

- Can create a group, add members, and record expenses split equally between them. State
  persists across page reloads via a JSON file.

### Added

- Split an expense by custom shares — assign each member a share count and divide the total
  proportionally. Zero shares exclude a member from the split. Existing equal-split expenses
  render unchanged.
