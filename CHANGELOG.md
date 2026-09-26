# Changelog

## Unreleased

## 0.1.2 - 2026-09-22

### Fixed

- Adding two expenses at the same time no longer loses one — both are still there when the
  group is reloaded.

- When two people mark a settlement done at the same time, both are kept instead of one
  being dropped silently.

## 0.1.1 - 2026-09-22

### Fixed

- Marking a settlement done now updates everyone's balances to reflect it, the done state
  survives a page reload, and marking the same settlement twice is rejected rather than
  double-counting it.

## 0.1.0 - 2026-09-21

### Added

- See who owes what in a group — each member's balance (owed, even, or owes) and the
  fewest transfers needed to settle up.

## 0.0.3 - 2026-09-21

### Fixed

- Error messages on the expense form now clear as soon as you edit the field they were
  about, instead of lingering on screen until the next submit attempt.

## 0.0.2 - 2026-09-21

### Added

- Split an expense by custom shares — assign each member a share count and divide the total
  proportionally. Zero shares exclude a member from the split. Existing equal-split expenses
  render unchanged.

### Fixed

- Rapidly submitting the create-group form no longer creates duplicate groups with the same
  name.

- Creating a group whose name matches an existing one is rejected — names are compared with
  case and surrounding whitespace ignored, so "Goa Trip" and " goa trip " cannot both exist.

## 0.0.1 - 2026-09-21

### Added

- Create a group, add members, and record expenses split equally between them. Groups and
  their expenses are still there after a page reload.
