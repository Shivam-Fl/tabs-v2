# ADR-0004: Single JSON file persistence behind src/store.js

**Date:** 2026-09-21
**Status:** accepted
**Forced by:** #1

## Decision
All group state lives in one JSON document, written atomically (tmp file + rename) by src/store.js, with an in-memory mode for tests. No database, no migrations.

## Why
The issue names the JSON file as the deliberate choice — 'the first thing a real deployment would replace, and deliberately not a database today'. The dataset is tiny, compose-mode QA is ephemeral, and atomic rename avoids torn writes without any infrastructure.

## Consequences
Easy: seeding is writing one file, tests run in memory, state is inspectable with cat. Hard: no concurrency beyond one process, no queries — fine at this scale; the store module is the single seam where a database would later slot in, and domain code never touches the filesystem so that swap is contained.
