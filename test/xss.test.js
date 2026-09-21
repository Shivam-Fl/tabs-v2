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
