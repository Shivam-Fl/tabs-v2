pattern: form-error-persists-after-fix
description: Form validation error text remains visible after the user corrects the invalid input.
metadata:
  type: pattern
---

**Symptom:** After a form submission fails with a visible error message (e.g. "Shares must be whole numbers"), the user corrects the input but the error text persists. The next submit succeeds, but the stale error confuses the user.

**Cause:** Error messages were only cleared on successful submit, not on the input's `input`/`change`/`click` events.

**Fix applied:** Add event listeners that clear the relevant error element immediately when the user edits any field that could have caused it. PR #14 fixed this for the expense form; the same pattern applies to any form in the app.

**How to check:** Submit a form with invalid input, confirm the error appears, then correct the input and verify the error disappears *before* the next submit.

**Related:** PR #12 (shares validation), PR #14 (error clearing fix).
