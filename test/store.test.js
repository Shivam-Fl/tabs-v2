import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore, StoreUnreadableError } from '../src/store.js';

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

// The corrupt file carries a marker so the assertion is about the file's own content
// reaching a caller, not about the shape of a message that happens not to quote it
// today. Node's SyntaxError embeds a fragment of what it failed to parse.
const CORRUPT_BODY = '{"seed-goa": {"members": [LEAKCANARY_MEMBER_NAME';

test('load() on a file of invalid JSON throws StoreUnreadableError, not a SyntaxError', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-corrupt-'));
  const storePath = path.join(tmpDir, 'groups.json');
  fs.writeFileSync(storePath, CORRUPT_BODY, 'utf8');
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;

  try {
    const { load } = await import('../src/store.js');
    assert.throws(() => load(), (err) => {
      assert.ok(err instanceof StoreUnreadableError, `threw ${err.name} instead`);
      assert.ok(!(err instanceof SyntaxError));
      assert.strictEqual(err.code, 'STORE_UNREADABLE');
      // The leak this type exists to stop: the raw parse error quotes the file back.
      assert.ok(!err.message.includes('LEAKCANARY_MEMBER_NAME'), 'the message quotes the file');
      // …but the cause is kept, so the process's own stderr can still show why.
      assert.ok(err.cause instanceof SyntaxError);
      return true;
    });
  } finally {
    process.env.STORE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('check() resolves when the store file is missing — a first run is healthy', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-check-missing-'));
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = path.join(tmpDir, 'nonexistent.json');

  try {
    const { check, load } = await import('../src/store.js');
    // Both halves of the same claim: the probe says usable and the read agrees, or the
    // health check and GET /api/groups would disagree about one store.
    await check();
    assert.deepStrictEqual(load(), {});
  } finally {
    process.env.STORE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('check() resolves after save() has written a valid file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-check-saved-'));
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = path.join(tmpDir, 'groups.json');

  try {
    const { check, save } = await import('../src/store.js');
    save({ g1: { id: 'g1', name: 'Goa Trip', members: [] } });
    await check();
  } finally {
    process.env.STORE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('check() rejects with StoreUnreadableError on a corrupt file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-check-corrupt-'));
  const storePath = path.join(tmpDir, 'groups.json');
  fs.writeFileSync(storePath, CORRUPT_BODY, 'utf8');
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = storePath;

  try {
    const { check } = await import('../src/store.js');
    await assert.rejects(check(), (err) => {
      assert.ok(err instanceof StoreUnreadableError, `rejected with ${err.name} instead`);
      assert.ok(!err.message.includes('LEAKCANARY_MEMBER_NAME'), 'the message quotes the file');
      return true;
    });
  } finally {
    process.env.STORE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// A read that fails for a reason other than bad JSON is still an unreadable store. The
// path is a directory rather than a chmod 000 file, which is a no-op for a root-owned
// process and would make the case environment-dependent.
test('check() rejects with StoreUnreadableError when the store path is a directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-check-isdir-'));
  const prev = process.env.STORE_PATH;
  process.env.STORE_PATH = tmpDir;

  try {
    const { check } = await import('../src/store.js');
    await assert.rejects(check(), (err) => err instanceof StoreUnreadableError);
  } finally {
    process.env.STORE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MemoryStore.check() resolves', async () => {
  await createStore({ memory: true }).check();
});

// Dropping check() from either branch of the factory would not fail loudly anywhere in
// the app — it would leave /healthz answering 503 forever, because a store it cannot
// interrogate is one it cannot vouch for. This is where that regression is caught.
test('createStore() returns a check function in memory mode and in file mode', () => {
  for (const store of [createStore({ memory: true }), createStore()]) {
    assert.strictEqual(typeof store.check, 'function');
    assert.strictEqual(typeof store.load, 'function');
  }
});
