import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PATH = path.resolve('data', 'groups.json');

function storePath() {
  return process.env.STORE_PATH || DEFAULT_PATH;
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// The one failure the store can have, and it is typed rather than raw because the raw
// one is a leak: JSON.parse's SyntaxError quotes a fragment of the file, and that text
// reaches the client through the server's generic INTERNAL branch. The message here is
// fixed and says nothing about the contents; the original error is kept on `.cause` for
// the process's own stderr.
export class StoreUnreadableError extends Error {
  constructor(cause) {
    super('Group data store could not be read');
    this.name = 'StoreUnreadableError';
    this.code = 'STORE_UNREADABLE';
    this.cause = cause;
  }
}

export function load() {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new StoreUnreadableError(err);
  }
}

// The health probe. Async, unlike load(), for two reasons: it is the only read the store
// makes that a timer has to be able to interrupt, and fs.promises keeps a slow mount off
// the event loop. A missing file resolves — that is a first run, and load() answers {}
// for it, so the two must not disagree about whether the same store is usable. The
// ENOENT test happens here rather than as an existsSync before the read because that
// pair races a file created or deleted in between, and in the delete direction it would
// report the store unreadable for exactly the case load() calls healthy.
export async function check() {
  const p = storePath();
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return;
    }
    throw new StoreUnreadableError(err);
  }
}

export function save(groups) {
  const p = storePath();
  ensureDir(p);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(groups, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

export function reset() {
  const p = storePath();
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

export class MemoryStore {
  constructor() {
    this._data = {};
  }

  load() {
    return { ...this._data };
  }

  save(groups) {
    this._data = JSON.parse(JSON.stringify(groups));
  }

  reset() {
    this._data = {};
  }

  check() {
    return Promise.resolve();
  }
}

// `check` is returned in both branches, not just the file one: the server asks every
// store it is handed whether it is usable, and a store that cannot answer is one it
// cannot vouch for.
export function createStore({ memory } = {}) {
  if (memory) {
    return new MemoryStore();
  }
  return { load, save, reset, check };
}
