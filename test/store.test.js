import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
