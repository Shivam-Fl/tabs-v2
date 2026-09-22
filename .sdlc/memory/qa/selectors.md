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
| List | `#settlement-list` (class `panel-list`) |

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
