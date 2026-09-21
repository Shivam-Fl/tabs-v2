import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { start } from '../src/server.js';
import { createStore } from '../src/store.js';

// The payload QA used to prove the stored-XSS sinks. It only fires when a string
// reaches the DOM as markup, so it doubles as the "is this text or is this HTML" probe.
const PAYLOAD = '<img src=x onerror="window.xssFired=true">';

async function post(path, body, baseUrl) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path, baseUrl) {
  const url = new URL(path, baseUrl);
  const res = await fetch(url);
  const data = await res.json();
  return { status: res.status, data };
}

test('server stores an HTML-bearing expense description verbatim — sanitizing is the UI\'s job', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const { data: groupData } = await post('/api/groups', {
      name: 'XSS Group',
      members: ['Alice', 'Bob'],
    }, url);
    const groupId = groupData.group.id;

    const created = await post(`/api/groups/${groupId}/expenses`, {
      description: PAYLOAD,
      amountPaise: 10000,
      payerId: 'Alice',
      splitMemberIds: ['Alice', 'Bob'],
    }, url);
    assert.strictEqual(created.status, 201);

    const { data } = await get(`/api/groups/${groupId}/expenses`, url);
    assert.strictEqual(data.expenses[0].description, PAYLOAD);
  } finally {
    close();
  }
});

test('server stores an HTML-bearing member name verbatim', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    const created = await post('/api/groups', {
      name: 'XSS Members',
      members: [PAYLOAD, 'Safe'],
    }, url);
    assert.strictEqual(created.status, 201);

    const { data } = await get('/api/groups', url);
    assert.strictEqual(data.groups[0].members[0].name, PAYLOAD);
  } finally {
    close();
  }
});

test('server rejects an HTML payload only for the usual reasons — empty, not unsafe', async () => {
  const store = createStore({ memory: true });
  const { close, url } = await start({ port: 0, store });
  try {
    // A description built out of angle brackets is a legitimate expense name
    // ("Lunch at <Pizza Hut>"), so the server must not be the thing that refuses it.
    const created = await post('/api/groups', {
      name: '<b>Bold trip</b>',
      members: [PAYLOAD],
    }, url);
    assert.strictEqual(created.status, 201);

    const blank = await post('/api/groups', { name: 'G', members: ['   '] }, url);
    assert.strictEqual(blank.status, 400);
  } finally {
    close();
  }
});

// The sinks QA found were in the client, and this repo has no DOM harness to drive
// them (node --test only, and no dependencies may be added). What is checkable from
// here is the property that made them exploitable: markup built by interpolating a
// server-supplied string into innerHTML. Guarding that property catches the two
// known sinks and any sibling that reintroduces the pattern later.
test('no innerHTML assignment in the client interpolates a value', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));

  const offenders = [];
  let at = script.indexOf('innerHTML');
  while (at !== -1) {
    const end = script.indexOf(';', at);
    const assignment = script.slice(at, end === -1 ? script.length : end);
    if (assignment.includes('${')) {
      offenders.push(assignment.replace(/\s+/g, ' ').trim());
    }
    at = script.indexOf('innerHTML', at + 1);
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `innerHTML assignment interpolates a value; use createElement + textContent:\n${offenders.join('\n')}`,
  );
});

function readClientScript() {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  return html.slice(html.indexOf('<script>'), html.lastIndexOf('</script>'));
}

// The client is one inline <script> in a static HTML file. node --test has no DOM and
// the work order forbids adding a dependency, so the only way to exercise the shipped
// function is to lift its source out of the file and evaluate it. Every top-level
// declaration in that script closes at column 0, so "\n}" ends the function.
function clientFunction(name) {
  const script = readClientScript();
  const start = script.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in public/index.html`);
  const end = script.indexOf('\n}', start);
  assert.notStrictEqual(end, -1, `${name} does not close at column 0`);
  return new Function(`${script.slice(start, end + 2)}\nreturn ${name};`)();
}

// AC-12: parseFloat('1,234') is 1, so a ₹1,234 expense was recorded as ₹1.00 and the
// user was never told. The separator has to be refused, not silently folded away.
test('toPaise accepts plain rupee amounts and refuses thousands separators', () => {
  const toPaise = clientFunction('toPaise');

  assert.strictEqual(toPaise('9000'), 900000);
  assert.strictEqual(toPaise('250'), 25000);
  assert.strictEqual(toPaise('83.33'), 8333);
  assert.strictEqual(toPaise(' 9000 '), 900000);

  assert.strictEqual(toPaise('1,234'), null);
  assert.strictEqual(toPaise('abc'), null);
  assert.strictEqual(toPaise('-5'), null);
  assert.strictEqual(toPaise('0'), null);
  assert.strictEqual(toPaise(''), null);
  assert.strictEqual(toPaise('1.234'), null);
});

// AC-11: the form is cleared only after the POST resolves, so a second submit while
// the first is in flight posted a second expense. requestSubmit() cannot be driven
// from here, so what is checkable is the guard's shape — a module-level flag that the
// handler tests before it awaits, and clears however it exits.
test('the expense form refuses a submit while one is already in flight', () => {
  const script = readClientScript();

  assert.match(script, /let expenseSubmitting = false;/, 'no module-level busy flag');

  const start = script.indexOf("getElementById('expense-form').addEventListener");
  assert.notStrictEqual(start, -1, 'expense form handler not found');
  const handler = script.slice(start, script.indexOf('\n});', start));

  const checkAt = handler.indexOf('if (expenseSubmitting) return;');
  const setAt = handler.indexOf('expenseSubmitting = true;');
  const awaitAt = handler.indexOf('await api(');
  assert.notStrictEqual(checkAt, -1, 'handler never bails out when already submitting');
  assert.notStrictEqual(setAt, -1, 'handler never sets the busy flag');
  assert.ok(checkAt < setAt, 'the flag is checked after it is set');
  assert.ok(setAt < awaitAt, 'the flag must be set before the POST starts, not after');

  // The flag has to cover the client-side validation returns too. Setting it up front
  // and only clearing it around the fetch would wedge the form shut the first time an
  // amount failed validation, because that path returns before the try block.
  const tryAt = handler.indexOf('try {');
  const earlyReturnAt = handler.indexOf("errorDiv.textContent = 'Please enter a valid positive amount.'");
  assert.notStrictEqual(tryAt, -1, 'handler has no try block to clear the flag from');
  assert.notStrictEqual(earlyReturnAt, -1, 'amount validation not found');
  assert.ok(tryAt < earlyReturnAt, 'the validation return escapes the finally that clears the flag');

  assert.match(handler, /finally \{[\s\S]*expenseSubmitting = false;/, 'the flag is never cleared');
});

// The create-group form had the same hole the expense form had: it clears its fields
// only once the POST resolves, so a second submit while the first is in flight creates
// a second group with the same name. Same guard, checked the same way — a module-level
// flag the handler tests before it awaits and clears however it exits.
test('the create-group form refuses a submit while one is already in flight', () => {
  const script = readClientScript();

  assert.match(script, /let groupSubmitting = false;/, 'no module-level busy flag');

  const start = script.indexOf("getElementById('create-group-form').addEventListener");
  assert.notStrictEqual(start, -1, 'create-group form handler not found');
  const handler = script.slice(start, script.indexOf('\n});', start));

  const checkAt = handler.indexOf('if (groupSubmitting) return;');
  const setAt = handler.indexOf('groupSubmitting = true;');
  const awaitAt = handler.indexOf('await api(');
  assert.notStrictEqual(checkAt, -1, 'handler never bails out when already submitting');
  assert.notStrictEqual(setAt, -1, 'handler never sets the busy flag');
  assert.ok(checkAt < setAt, 'the flag is checked after it is set');
  assert.ok(setAt < awaitAt, 'the flag must be set before the POST starts, not after');

  // The flag has to cover the client-side validation return too, for the same reason it
  // does on the expense form: setting it up front and clearing it around the fetch alone
  // would wedge the form shut the first time a submit carried no members.
  const tryAt = handler.indexOf('try {');
  const earlyReturnAt = handler.indexOf(
    "errorDiv.textContent = 'Please enter at least one member.'",
  );
  assert.notStrictEqual(tryAt, -1, 'handler has no try block to clear the flag from');
  assert.notStrictEqual(earlyReturnAt, -1, 'members validation not found');
  assert.ok(tryAt < earlyReturnAt, 'the validation return escapes the finally that clears the flag');

  assert.match(handler, /finally \{[\s\S]*groupSubmitting = false;/, 'the flag is never cleared');
});
