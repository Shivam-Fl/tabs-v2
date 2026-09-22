# Memory index

One line per entry, describing **when it applies** — an agent reads this before deciding
whether to open the entry itself.

## Always
- [project.md](project.md) — stack, layout, commands. Read before any planning.
- [conventions.md](conventions.md) — naming, money, server patterns, tests. Read before writing code.

## Situational
- [qa/environment.md](qa/environment.md) — port 3000, endpoints, error codes, known flaky. Read before browser QA.
- [qa/selectors.md](qa/selectors.md) — stable selectors for all views and forms.
- [patterns/](patterns/) — bug shapes this repo has produced before. Grep by symptom.
  - [form-error-persists-after-fix](patterns/form-error-persists-after-fix.md) — error text stays visible after user corrects input.
- [decisions/](decisions/) — why things are as they are. Read before proposing a rewrite.
  - 5 ADRs: zero-deps, paise arithmetic, greedy settlement, JSON persistence, ledger derivation.
