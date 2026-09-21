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

export function load() {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return {};
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
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
}

export function createStore({ memory } = {}) {
  if (memory) {
    return new MemoryStore();
  }
  return { load, save, reset };
}
