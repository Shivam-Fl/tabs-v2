import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStore } from '../src/store.js';

test('save+load round-trips a group via in-memory mode', () => {
  const store = createStore({ memory: true });
  const group = {
    id: 'g1',
    name: 'Test',
    members: [{ id: 'A', name: 'A' }],
    expenses: [],
    createdAt: new Date().toISOString(),
  };
  store.save({ [group.id]: group });
  const loaded = store.load();
  assert.deepStrictEqual(loaded, { [group.id]: group });
});

test('load on missing file returns empty object', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-missing-'));
  const storePath = path.join(tmpDir, 'nonexistent.json');
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;

  const { load } = await import('../src/store.js');
  const result = load();
  assert.deepStrictEqual(result, {});

  process.env.STORE_PATH = prev;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('second save overwrites the first with no torn read', () => {
  const store = createStore({ memory: true });
  const g1 = {
    id: 'g1',
    name: 'First',
    members: [{ id: 'A', name: 'A' }],
    expenses: [],
    createdAt: new Date().toISOString(),
  };
  const g2 = {
    id: 'g2',
    name: 'Second',
    members: [{ id: 'B', name: 'B' }],
    expenses: [],
    createdAt: new Date().toISOString(),
  };

  store.save({ [g1.id]: g1 });
  store.save({ [g2.id]: g2 });

  const loaded = store.load();
  assert.ok(loaded.g2);
  assert.strictEqual(loaded.g2.name, 'Second');
});

test('file mode writes to STORE_PATH and reads back', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-file-'));
  const storePath = path.join(tmpDir, 'groups.json');
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;

  const { load, save, reset } = await import('../src/store.js');

  reset();

  const group = {
    id: 'file-test',
    name: 'File Mode Test',
    members: [{ id: 'X', name: 'X' }],
    expenses: [],
    createdAt: new Date().toISOString(),
  };
  save({ [group.id]: group });

  assert.ok(fs.existsSync(storePath), 'Store file was not created');
  const loaded = load();
  assert.deepStrictEqual(loaded, { [group.id]: group });

  process.env.STORE_PATH = prev;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// bin/seed.js used to call store.reset() unconditionally, and because a Tabs installation
// is exactly one JSON file, running the documented `npm run sdlc:seed` on a checkout with
// real groups in it destroyed the whole dataset with no prompt and no undo. The wipe is now
// opt-in via --force; the default merges the fixture into whatever is already there.
//
// The real script is run in a child process, not reimplemented here: the argument parsing,
// the merge, the name-clash guard and the messages an operator reads before trusting the
// command all live in that file, and a copy of it in this file would drift from it and then
// read as coverage it no longer provides.
const SEED_SCRIPT = fileURLToPath(new URL('../bin/seed.js', import.meta.url));

function runSeed({ storePath, args = [], cwd = process.cwd() }) {
  const env = { ...process.env };
  if (storePath === undefined) {
    delete env.STORE_PATH;
  } else {
    env.STORE_PATH = storePath;
  }
  // spawnSync rather than execFileSync so a non-zero exit is returned instead of thrown —
  // the unknown-option case asserts on exit code 2 and needs its stderr.
  const result = spawnSync(process.execPath, [SEED_SCRIPT, ...args], { env, cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// A pre-existing group, shaped the way createGroup writes one so the merge round-trips it
// through the file store unchanged.
function realGroup(id, name) {
  return {
    id,
    name,
    members: [{ id: 'Alice', name: 'Alice' }, { id: 'Bob', name: 'Bob' }],
    expenses: [],
    settlements: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function writeStore(storePath, groups) {
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;
  try {
    createStore().save(groups);
  } finally {
    process.env.STORE_PATH = prev;
  }
}

function readStore(storePath) {
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

test('seeding over a store that already holds a group keeps that group and adds the fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-merge-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    const existing = realGroup('flat-share', 'Flat share');
    writeStore(storePath, { 'flat-share': existing });

    const run = runSeed({ storePath });
    assert.strictEqual(run.status, 0, run.stderr);

    const data = readStore(storePath);
    assert.deepStrictEqual(Object.keys(data), ['flat-share', 'seed-goa']);
    assert.deepStrictEqual(data['flat-share'], existing);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('seeding into an empty store writes only the fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-empty-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    const run = runSeed({ storePath });
    assert.strictEqual(run.status, 0, run.stderr);

    // The fresh-container path QA depends on. A guard that refused an empty store would
    // cost QA its fixtures and the next failure would read as a product bug.
    assert.ok(fs.existsSync(storePath), 'Store file was not created');
    assert.deepStrictEqual(Object.keys(readStore(storePath)), ['seed-goa']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--force deletes every existing group and leaves only the fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-force-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    writeStore(storePath, {
      'flat-share': realGroup('flat-share', 'Flat share'),
      'book-club': realGroup('book-club', 'Book club'),
    });

    const run = runSeed({ storePath, args: ['--force'] });
    assert.strictEqual(run.status, 0, run.stderr);

    const data = readStore(storePath);
    assert.deepStrictEqual(Object.keys(data), ['seed-goa']);
    assert.strictEqual(data['flat-share'], undefined);
    assert.strictEqual(data['book-club'], undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('the default run over a store that already holds the fixture replaces it in place', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-twice-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    writeStore(storePath, { 'flat-share': realGroup('flat-share', 'Flat share') });
    runSeed({ storePath });
    runSeed({ storePath });

    const data = readStore(storePath);
    assert.deepStrictEqual(Object.keys(data), ['flat-share', 'seed-goa']);
    assert.deepStrictEqual(
      data['seed-goa'].expenses.map((e) => [e.description, e.amountPaise, e.payerId]),
      [
        ['Hotel', 900000, 'Asha'],
        ['Dinner', 450000, 'Rahul'],
      ],
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("a pre-existing group named 'Goa trip' under a different id stops the seed writing a second one", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-clash-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    const existing = realGroup('other-goa', 'Goa trip');
    writeStore(storePath, { 'other-goa': existing });

    // POST /api/groups rejects a duplicate name with GROUP_NAME_TAKEN, comparing the
    // trimmed, case-folded name. Merging a second "Goa trip" in beside an existing one
    // would write a store the API could not have produced.
    const run = runSeed({ storePath });
    assert.strictEqual(run.status, 0, run.stderr);

    const data = readStore(storePath);
    assert.deepStrictEqual(Object.keys(data), ['other-goa']);
    assert.deepStrictEqual(data['other-goa'], existing);
    assert.match(run.stdout, /Goa trip/);
    assert.match(run.stdout, /--force/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("the clash check matches the API's name comparison: trimmed and case-folded", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-clash-case-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    // src/server.js compares existing.name.trim().toLowerCase() with the new name, so
    // ' goa TRIP ' is the same group to the user who typed it. If the seed compared
    // anything less, the two would disagree about what a duplicate is.
    writeStore(storePath, { 'other-goa': realGroup('other-goa', '  goa TRIP  ') });

    const run = runSeed({ storePath });
    assert.strictEqual(run.status, 0, run.stderr);
    assert.deepStrictEqual(Object.keys(readStore(storePath)), ['other-goa']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('the seed writes to data/groups.json relative to the working directory when STORE_PATH is unset', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-cwd-'));
  try {
    const run = runSeed({ storePath: undefined, cwd: tmpDir });
    assert.strictEqual(run.status, 0, run.stderr);

    const written = path.join(tmpDir, 'data', 'groups.json');
    assert.ok(fs.existsSync(written), 'data/groups.json was not created in the working directory');
    assert.deepStrictEqual(Object.keys(readStore(written)), ['seed-goa']);
    // Nothing outside the temp dir: the write location is the one src/store.js resolves.
    assert.deepStrictEqual(fs.readdirSync(tmpDir), ['data']);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("the seed's own output states what it does to existing data", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-output-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    writeStore(storePath, { 'flat-share': realGroup('flat-share', 'Flat share') });

    const kept = runSeed({ storePath });
    assert.match(kept.stdout, new RegExp(storePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(kept.stdout, /existing groups are kept/);
    assert.match(kept.stdout, /1 existing group\(s\) left in place/);

    const forced = runSeed({ storePath, args: ['--force'] });
    assert.match(forced.stdout, new RegExp(storePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    // The run above left both 'Flat share' and the fixture behind, so the count is 2 —
    // it is what the force run actually deleted, not a fixed number in the message.
    assert.match(forced.stdout, /deleted 2 existing group\(s\)/);
    assert.match(forced.stdout, /--force/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--help prints the usage and writes nothing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-help-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    writeStore(storePath, { 'flat-share': realGroup('flat-share', 'Flat share') });
    const before = fs.readFileSync(storePath, 'utf8');

    const run = runSeed({ storePath, args: ['--help'] });
    assert.strictEqual(run.status, 0, run.stderr);
    assert.match(run.stdout, /--force/);
    assert.match(run.stdout, /DESTRUCTIVE/);
    assert.strictEqual(fs.readFileSync(storePath, 'utf8'), before);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('an unrecognised option is refused with exit code 2 and writes nothing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-bad-flag-'));
  const storePath = path.join(tmpDir, 'groups.json');
  try {
    writeStore(storePath, { 'flat-share': realGroup('flat-share', 'Flat share') });
    const before = fs.readFileSync(storePath, 'utf8');

    const run = runSeed({ storePath, args: ['--focre'] });
    assert.strictEqual(run.status, 2);
    assert.match(run.stderr, /--focre/);
    assert.strictEqual(fs.readFileSync(storePath, 'utf8'), before);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
