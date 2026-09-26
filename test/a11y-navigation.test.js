import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { start } from '../src/server.js';
import { createStore } from '../src/store.js';

// The app's navigation is built out of two click handlers. Before this suite existed both
// sat on elements the keyboard cannot reach: a <span> and an <li>. A control that only
// answers a click takes no focus, has no role and no key event ever reaches it, so the
// app worked perfectly for a mouse and not at all for a keyboard.
//
// There is no browser driver in this repo (zero dependencies, ADR-0001), so these cases
// assert against the markup the server actually serves rather than against a live DOM.
// That is enough to pin the properties that made navigation mouse-only — the element
// types, the tab order, the focus styles — and the browser-level behaviour is covered by
// the acceptance criteria and the QA script.

const INDEX_PATH = path.resolve('public', 'index.html');
const rawHtml = fs.readFileSync(INDEX_PATH, 'utf8');
// Collapse runs of whitespace so the assertions below are about structure rather than
// about the file's indentation.
const html = rawHtml.replace(/\s+/g, ' ');

function styleBlock() {
  return html.slice(html.indexOf('<style>') + '<style>'.length, html.indexOf('</style>'));
}

function scriptBlock() {
  return html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'));
}

// Slice a named function out of the inline script by the two markers that bracket it.
function sliceFunction(startMarker, endMarker) {
  const script = scriptBlock();
  const from = script.indexOf(startMarker);
  const to = script.indexOf(endMarker, from);
  assert.notStrictEqual(from, -1, `${startMarker} not found in the inline script`);
  assert.notStrictEqual(to, -1, `${endMarker} not found after ${startMarker}`);
  return script.slice(from, to);
}

async function withServer(fn) {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    return await fn(url);
  } finally {
    close();
  }
}

async function getText(url, path) {
  const res = await fetch(new URL(path, url));
  return { status: res.status, contentType: res.headers.get('content-type') || '', body: await res.text() };
}

test('the back control is a real control, not a span', () => {
  // The id is deliberately unchanged, so the #back-link selector documented in
  // .sdlc/memory/qa/selectors.md keeps resolving.
  assert.match(html, /<button[^>]*\bid="back-link"/);
  assert.doesNotMatch(html, /<span[^>]*\bid="back-link"/);
  assert.doesNotMatch(html, /<a(?![^>]*\bhref)[^>]*\bid="back-link"/);
});

test('the same control is what the server actually serves', async () => {
  // src/server.js caches index.html in htmlCache, so this is the markup a browser
  // receives, not just the file on disk.
  await withServer(async (url) => {
    const { status, contentType, body } = await getText(url, '/');
    assert.strictEqual(status, 200);
    assert.ok(contentType.startsWith('text/html'), `expected text/html, got ${contentType}`);
    assert.match(body, /<button[^>]*\bid="back-link"/);
  });
});

test('the group list builds one button per group and no longer a listener on the li', () => {
  // This is the assertion that the whole of the app's navigation stopped being
  // mouse-only.
  const script = scriptBlock();
  assert.doesNotMatch(script, /li\.addEventListener\('click'/);
  assert.match(script, /button\.className = 'group-item'/);
  assert.match(script, /button\.dataset\.groupId = group\.id/);
  assert.match(script, /button\.textContent = group\.name/);
  assert.match(script, /button\.type = 'button'/);
  assert.match(script, /button\.addEventListener\('click', \(\) => showGroupView\(group\.id\)\)/);
});

test("the group row's accessible name is the group name and is set as text", () => {
  const script = scriptBlock();
  assert.match(script, /button\.textContent = group\.name/);

  // The render loop, taken from the for to the function after it. The row must not become
  // the stored-XSS sink that test/xss.test.js already guards elsewhere in this file.
  const loop = script.slice(
    script.indexOf('for (const group of data.groups)'),
    script.indexOf('function renderBalances'),
  );
  assert.doesNotMatch(loop, /innerHTML/);
});

test('the stylesheet defines a focus indicator of its own', () => {
  const style = styleBlock();
  assert.match(style, /:focus-visible\s*\{[^}]*outline:\s*3px solid #1d4ed8/);
  assert.match(style, /:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
  // A rule that cancels the ring is the regression this case exists to catch.
  assert.doesNotMatch(style, /outline:\s*(none|0)/);
});

test("the back control's hover fill is cancelled, so the base button rule does not repaint it", () => {
  // button:hover is specificity 0,1,1 and outranks .back-link at 0,1,0, so without this
  // the back control becomes a solid indigo block under the pointer.
  assert.match(styleBlock(), /\.back-link:hover\s*\{[^}]*background:\s*none/);
});

test("the group row's hover fill is cancelled for the same reason, and the row is a full-width target", () => {
  const style = styleBlock();
  assert.match(style, /\.group-list button:hover\s*\{[^}]*background:\s*none/);
  assert.match(style, /\.group-list button\s*\{[^}]*width:\s*100%/);
});

test('the tab order AC-3 depends on is the one the markup actually has, and nothing was reordered to suit the test', () => {
  const back = html.indexOf('id="back-link"');
  const heading = html.indexOf('<h1 id="group-title"');
  const desc = html.indexOf('id="expense-desc"');

  assert.ok(back !== -1 && heading !== -1 && desc !== -1, 'all three elements must be present');
  assert.ok(back < heading, 'the back control precedes the heading');
  assert.ok(heading < desc, 'the heading precedes the first expense field');

  // The heading is skipped by Tab, which is why AC-3 reaches the back control with
  // Shift+Tab from #expense-desc and not with Tab from the heading. A refactor that
  // moved the back control below the heading would fail here rather than silently
  // breaking QA.
  assert.match(html, /<h1 id="group-title" tabindex="-1">/);
});

test('Escape returns to the group list, and only from the group list', () => {
  const script = scriptBlock();
  const start = script.indexOf("document.addEventListener('keydown'");
  assert.notStrictEqual(start, -1, 'a document-level keydown handler must exist');
  const handler = script.slice(start, script.indexOf('});', start) + 2);

  assert.match(handler, /e\.key !== 'Escape'/);
  assert.match(handler, /getElementById\('view-group'\)\.classList\.contains\('hidden'\)/);
  assert.match(handler, /showCreateView\(\)/);
});

test('the back control still works by click and needs no key path of its own', () => {
  // One handler. Enter and Space are left to the <button> itself, which dispatches click
  // for both natively — a key handler here would fire the pair twice.
  assert.match(scriptBlock(), /getElementById\('back-link'\)\.addEventListener\('click', showCreateView\);/);
});

test('focus comes back to the row that was opened, not to the body', () => {
  const script = scriptBlock();
  assert.match(script, /let lastOpenedGroupId = null;/);

  const openGroup = sliceFunction('function showGroupView(', 'async function loadGroups');
  assert.match(openGroup, /lastOpenedGroupId = groupId;/);

  const back = sliceFunction('function showCreateView()', 'function showGroupView');
  assert.match(back, /querySelectorAll\('#group-list \.group-item'\)/);
  assert.match(back, /row\.dataset\.groupId === lastOpenedGroupId/);
  assert.match(back, /\.focus\(\)/);

  // Index the two and assert loadGroups comes first: a focus restore that runs before
  // the list is rebuilt restores focus to nothing.
  const loadAt = back.indexOf('loadGroups()');
  const thenAt = back.indexOf('.then(');
  assert.ok(loadAt !== -1 && thenAt !== -1, 'the restore must hang off a loadGroups() call');
  assert.ok(loadAt < thenAt, 'the focus restore must run after the list has been rebuilt');
});

test('the focus restore falls back to the first row, then to #group-name, when the opened row is not in the rebuilt list', () => {
  // This is the only coverage those arms can have. src/server.js has no delete route and
  // the page exposes no delete control, so no browser session can produce a group that
  // has gone missing. AC-11 says so rather than leaving the clause looking
  // browser-checked. If a delete route is ever added, this needs to become a real test.
  const back = sliceFunction('function showCreateView()', 'function showGroupView');
  assert.match(
    back,
    /rows\.find\(\(row\) => row\.dataset\.groupId === lastOpenedGroupId\) \|\| rows\[0\] \|\| document\.getElementById\('group-name'\)/,
  );
  assert.match(back, /if \(target\) target\.focus\(\);/);
});

test('opening a group focuses its heading, and only after the name is in it', () => {
  assert.match(html, /<h1 id="group-title" tabindex="-1">/);

  const openGroup = sliceFunction('function showGroupView(', 'async function loadGroups');
  assert.match(openGroup, /getElementById\('group-title'\)\.textContent = 'Loading…'/);

  // The ordering is the assertion: focusing on the placeholder reads out 'Loading'
  // instead of the group name.
  const loadAt = openGroup.indexOf('loadGroup(');
  const focusAt = openGroup.indexOf("getElementById('group-title').focus()");
  assert.ok(loadAt !== -1 && focusAt !== -1, 'the heading focus must be in showGroupView');
  assert.ok(loadAt < focusAt, 'focus must wait for the load that fills in the name');
});

test('the settlement money path is untouched', () => {
  // Mark done is the one path in this app that moves money, and it was already a real
  // button with a delegated listener. The delegated listener, the class and the dataset
  // its handler reads must all survive this change.
  const script = scriptBlock();
  assert.match(script, /getElementById\('settlement-list'\)\.addEventListener\('click'/);
  assert.match(script, /button\.className = 'transfer-done-btn'/);
  assert.match(script, /button\.dataset\.amount = String\(transfer\.amountPaise\)/);
});

test('every selector documented in .sdlc/memory/qa/selectors.md still resolves in the served page', async () => {
  // This is what discharges the ticket's 'selectors are updated' requirement without
  // editing the reserved memory file. .transfer-done-btn, .panel-list, .empty-state and
  // .share-input are created at runtime by the script and are asserted in the other
  // cases, not here.
  //
  // Each entry is the documented selector paired with the markup it resolves to: the
  // selectors are CSS forms, and the page carries them as attributes. Asserting the CSS
  // text against the HTML would not check that the element survived.
  const documented = [
    ['#view-create-group', 'id="view-create-group"'],
    ['#view-group', 'id="view-group"'],
    ['#create-group-form', 'id="create-group-form"'],
    ['#group-name', 'id="group-name"'],
    ['#group-members', 'id="group-members"'],
    ['#create-group-error', 'id="create-group-error"'],
    ['#group-list', 'id="group-list"'],
    ['#back-link', 'id="back-link"'],
    ['#group-title', 'id="group-title"'],
    ['#expense-form', 'id="expense-form"'],
    ['#expense-desc', 'id="expense-desc"'],
    ['#expense-amount', 'id="expense-amount"'],
    ['#expense-payer', 'id="expense-payer"'],
    ['input[name="split-mode"]', 'name="split-mode"'],
    ['#split-checkboxes', 'id="split-checkboxes"'],
    ['#expense-error', 'id="expense-error"'],
    ['#balances-panel', 'id="balances-panel"'],
    ['#balances-error', 'id="balances-error"'],
    ['#balances-list', 'id="balances-list"'],
    ['#settlement-panel', 'id="settlement-panel"'],
    ['#settlement-error', 'id="settlement-error"'],
    ['#settlement-list', 'id="settlement-list"'],
    ['#expense-list', 'id="expense-list"'],
  ];

  await withServer(async (url) => {
    const { status, body } = await getText(url, '/');
    assert.strictEqual(status, 200);
    for (const [selector, markup] of documented) {
      assert.ok(body.includes(markup), `${selector} no longer resolves in the served page`);
    }
  });
});
