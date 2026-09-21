# ADR-0002: Money is integer paise; floats only at the UI boundary

**Date:** 2026-09-21
**Status:** accepted
**Forced by:** #1

## Decision
All amounts are integers of paise end to end — storage, API payloads, domain logic. The UI converts to a rupee string for display and parses input to paise before sending.

## Why
Floats are how expense apps end up showing 0.30000000000000004 and how a ₹100 split between three leaves ₹99.99 owed. Integer minor units make equality, summation and the net-to-zero invariant exact and testable.

## Consequences
Easy: the balance-net-zero and split-sums-exactly invariants are checkable with === in tests. Hard: every future input path (imports, edits, other currencies) must convert at its boundary too; the invariant list names this so reviewers enforce it.
