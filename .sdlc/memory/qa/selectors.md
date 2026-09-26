# Stable selectors

Prefer these over anything derived from text or DOM position.

## Views
| Element | Selector |
|---|---|
| Create group view | `#view-create-group` |
| Group detail view | `#view-group` |
| Hidden view marker | `.hidden` (class toggled to show/hide views) |

## Create group form
| Element | Selector |
|---|---|
| Form | `#create-group-form` |
| Group name input | `#group-name` |
| Members textarea | `#group-members` |
| Error message | `#create-group-error` (class `error`) |
| Group list | `#group-list` (inside `#existing-groups`) |
| Empty state text | `.empty-state` (appears in list when no items) |

## Group detail view
| Element | Selector |
|---|---|
| Back link | `#back-link` |
| Group title | `#group-title` |
| Expense form | `#expense-form` |
| Description input | `#expense-desc` |
| Amount input | `#expense-amount` |
| Payer select | `#expense-payer` |
| Split mode radios | `input[name="split-mode"]` (values: `equally`, `shares`) |
| Split checkboxes container | `#split-checkboxes` (class `checkbox-group`) |
| Expense error | `#expense-error` (class `error`) |

## Balances panel
| Element | Selector |
|---|---|
| Panel | `#balances-panel` |
| Error | `#balances-error` (class `error`) |
| List | `#balances-list` (class `panel-list`) |

## Settlement panel
| Element | Selector |
|---|---|
| Panel | `#settlement-panel` |
| Error | `#settlement-error` (class `error`) |
| List | `#settlement-list` (class `panel-list`) |
| Any transfer row (done *or* pending) | `.transfer` |
| **Pending** transfer row | `.transfer:not(.transfer-done)` — see below |
| Done transfer row | `.transfer-done` (added on top of `.transfer`) |
| Done transfer button | `.transfer-done-btn` (only ever inside a pending row) |

**`.transfer` is on every row, not just pending ones.** A done row gets
`class="transfer transfer-done"`; a pending row gets `class="transfer"` plus a
`.transfer-done-btn`. So `document.querySelectorAll('.transfer').length` counts history *and*
outstanding transfers together, and a test asserting "one pending transfer left" against it
passes for the wrong reason and then fails the moment a second transfer is recorded. Count
pending with `.transfer:not(.transfer-done)`, or — more robustly, because it does not depend on
the class split at all — count `.transfer-done-btn`, which exists on pending rows only.

Two more things about this panel that make tests flaky rather than wrong:
- **Done rows render first.** The panel is ordered history-then-outstanding, so `.transfer`
  index 0 is the oldest done transfer, not the first pending one. Never index into it.
- **`.empty-state` disappears as soon as one transfer is done.** A group whose only transfer
  has been recorded still has one line of content, so the "No settlements yet." placeholder is
  gone while a transfer is still logically outstanding. Assert on `.transfer` counts, not on
  the presence of `.empty-state`.

## Expense list
| Element | Selector |
|---|---|
| Container | `#expense-list` |

## Reusable patterns
| Element | Selector |
|---|---|
| Error text | `.error` (class on error divs) |
| Empty state | `.empty-state` (class on placeholder list items) |
| Panel lists | `.panel-list` (class on `<ul>` inside panels) |
| Hidden share inputs | `.share-input.hidden` (toggled when split mode or checkbox changes) |
