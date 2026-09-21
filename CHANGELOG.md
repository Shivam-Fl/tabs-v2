# Changelog

## Unreleased

### Fixed

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
