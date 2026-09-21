# ADR-0005: Balances derive from an append-only ledger of expenses and settlements

**Date:** 2026-09-21
**Status:** accepted
**Forced by:** #1

## Decision
Recording an expense and marking a settlement done are both ledger entries. Balances are always recomputed from the full history; they are never stored or mutated directly.

## Why
Derived balances make 'mark settlement as done, see balances update' a consequence of the same arithmetic as everything else, with one code path and no cached state to drift. It also makes the net-to-zero check meaningful — it validates the whole history, not a running total.

## Consequences
Easy: no staleness bugs, history is auditable, undo (if ever wanted) is appending a compensating entry. Hard: recomputation cost grows with history length — irrelevant at group-trip scale, and the derivation is a pure function that can be memoised later without changing semantics.
