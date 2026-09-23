pattern: fetch-promise-all-misses-server-race
description: Two fetch() calls in Promise.all never overlap on loopback — the first handler finishes parseBody before the second request event fires.
metadata:
  type: pattern
---

**Symptom:** A test intended to catch a concurrent-write race condition (two requests writing to the same resource) always passes, even against the unfixed code. The race is real in production but the test never triggers it.

**Cause:** On loopback, two `fetch()` calls in `Promise.all` do not overlap. The first request's body is read and its handler has left `await parseBody(req)` before the second connection's `request` event is even emitted. Measured at 0/50 iterations caught that way vs 20/20 with the correct approach.

**Fix:** Use raw `http.request` with `flushHeaders()` followed by a delayed `req.end(payload)`. This parks the handler on `await parseBody(req)` while the body has not yet arrived, allowing a second request to enter the same handler and reach the same await point before either completes.

```js
function postAfterHeaders(path, body, baseUrl, delayMs = 50) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.flushHeaders();
    setTimeout(() => req.end(JSON.stringify(body)), delayMs);
  });
}
```

**When to use:** Any test that must prove two concurrent writes to the same JSON-file store cannot lose a write. `Promise.all` + `fetch` is fine for testing that two requests *both succeed*, but not for testing that their writes *both persist*.

**Related:** PR #18 (introduced the test helper, caught the race in both expense and settlement handlers).
