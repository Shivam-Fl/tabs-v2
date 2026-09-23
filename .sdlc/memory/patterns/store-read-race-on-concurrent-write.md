pattern: store-read-race-on-concurrent-write
description: Two concurrent POSTs to the same group drop one write because store.load() runs before await parseBody.
metadata:
  type: pattern
---

**Symptom:** Two requests POST to `/api/groups/:id/expenses` (or `/settlements`) at the same time. Both return 201, but a subsequent GET shows only one expense/settlement.

**Cause:** `store.load()` and the group lookup were placed *before* `await parseBody(req)`. Two concurrent requests therefore loaded the same snapshot, each appended its entry to its own copy, and the second `store.save()` overwrote the first.

**Fix:** Move `store.load()` and the group lookup to *after* the last `await` in the handler (`parseBody`), so the load→modify→save span is synchronous with no gap to guard. There is no lock because there is no longer a yield point between read and write.

**Side effect:** Error precedence changed. A request with both bad JSON and a nonexistent group now reports 400 `INVALID_JSON` (body parsed first) rather than 404 `GROUP_NOT_FOUND` (group lookup moved after parse). This is correct — the body must be valid before any lookup is meaningful — but it is a behaviour change worth noting if tests pin the old order.

**How to check:** Any mutating handler that reads the store, modifies it, and writes it back must place `store.load()` after every `await` in that handler. Grep for `store.load()` in `src/server.js` and verify it is not preceded by an `await` within the same handler block.

**Related:** PR #18 (expense race fix), PR #17 (settlement handler had the same shape when added, fixed in #18).
