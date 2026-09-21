# ADR-0003: Splits distribute the remainder; settlement is greedy and deterministic

**Date:** 2026-09-21
**Status:** accepted
**Forced by:** #1

## Decision
Equal and share splits assign the indivisible remainder one paise at a time in a fixed order (member insertion order). Settlement is greedy largest-debtor-to-largest-creditor with a stable tie-break, so identical balances always yield the identical transfer list.

## Why
₹100 split three ways must be 34/33/33 summing to exactly ₹100, never 33.33 three times. And a settlement that reshuffles on every view is not trusted even when correct; exact minimisation is NP-hard and predictability beats optimality for three friends.

## Consequences
Easy: determinism makes settlement testable by golden cases and makes QA screenshots comparable across runs. Hard: the greedy algorithm can produce one transfer more than the true minimum in contrived cases; accepted, and the deterministic tie-break means any future improvement must update the golden tests deliberately.
