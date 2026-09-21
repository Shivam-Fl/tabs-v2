# ADR-0001: Node 20+ standard library only, zero dependencies

**Date:** 2026-09-21
**Status:** accepted
**Forced by:** #1

## Decision
The entire product is built on node:http, node:fs, node:test and a static vanilla-JS UI. package.json exists only to hold the four sdlc: verbs; its dependencies field stays empty.

## Why
The issue mandates it, and the constraint is well-aimed: all of this product's risk is arithmetic (splits, remainders, settlement), none of it is infrastructure. Zero dependencies means sdlc:verify cannot fail on an install, sdlc:serve cannot fail on a bundler, and the agent implementing ticket nine faces exactly the same environment as ticket one.

## Consequences
Easy: CI is fast and deterministic, onboarding is 'node src/server.js', nothing to audit. Hard: anything the stdlib lacks (routing helpers, validation, templating) is written by hand — acceptable at this size, and the module boundaries in this brief are where such helpers would live if the product grows.
