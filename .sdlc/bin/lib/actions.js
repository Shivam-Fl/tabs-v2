// Shared helpers for the workflow scripts: gh calls, step outputs, config loading.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const ROOT = process.env.SDLC_ROOT ?? process.cwd();

export async function gh(args, opts = {}) {
  const { stdout } = await exec('gh', args, { maxBuffer: 20 * 1024 * 1024, ...opts });
  return stdout.trim();
}

export async function ghJson(args) {
  return JSON.parse(await gh(args));
}

export function setOutput(key, value) {
  const v = typeof value === 'string' ? value : JSON.stringify(value);
  if (process.env.GITHUB_OUTPUT) {
    const delim = 'EOF_' + Math.random().toString(36).slice(2);
    appendFileSync(process.env.GITHUB_OUTPUT, key + '<<' + delim + '\n' + v + '\n' + delim + '\n');
  }
  process.stdout.write(key + '=' + v + '\n');
}

/**
 * js-yaml is imported LAZILY. Some scripts run before `npm ci` — ci-verify reads
 * `verify.install` from config to decide how to install in the first place — so a top-level
 * dependency import here is a bootstrap deadlock: the config that says how to install
 * cannot be read until after installing.
 */
export async function loadConfig(root = ROOT) {
  const path = join(root, '.sdlc', 'config.yml');
  if (!existsSync(path)) die('no .sdlc/config.yml — run `sdlc init` first');
  const { load: parseYaml } = await import('js-yaml');
  return parseYaml(readFileSync(path, 'utf8')) ?? {};
}

/**
 * Where a dying script leaves the reason, for the handler that answers it.
 *
 * The `if: failure()` step that dispatches the self-heal loop runs in the SAME job as the
 * step that failed, while that job is still in progress — and GitHub serves neither run logs
 * nor job logs for a run that has not finished. The first live test of the loop produced
 * exactly that: "no log, no digest and no failing-check detail could be retrieved", on a job
 * whose own console plainly said what broke. The error has to be handed over locally,
 * because the API cannot hand it back.
 */
export const ERROR_LOG = process.env.SDLC_ERROR_LOG
  ?? join(process.env.RUNNER_TEMP || tmpdir(), 'sdlc-error.log');

/**
 * Leave the reason for a non-zero exit where the failure handler will find it.
 *
 * Separate from `die()` because not every failure is a die(): a refused lock, a budget
 * exceeded, a report that fails its own consistency check — all of them printed a perfectly
 * clear message and then called `process.exit(1)` directly. The breadcrumb covered `die()`
 * and nothing else, so those produced "no log, no digest and no failing-check detail could
 * be retrieved" and went to a human. A plan stage refused a lock because another run already
 * held it, which is correct behaviour, and it was reported as an unreadable mystery.
 *
 * Appended, not written: one step can fail after another already left a note, and both are
 * evidence. Failure here is never fatal — off a runner the path may not be writable, and a
 * breadcrumb that cannot be dropped must not turn a real error into a different one.
 */
export function noteError(message) {
  try { appendFileSync(ERROR_LOG, 'sdlc: ' + String(message).trim() + '\n'); }
  catch { /* not on a runner, or read-only */ }
}

export function die(message, code = 1) {
  process.stderr.write('sdlc: ' + message + '\n');
  noteError(message);
  process.exit(code);
}

export function flags(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export const repo = () => process.env.GITHUB_REPOSITORY ?? die('GITHUB_REPOSITORY is not set');

/** Extract the first fenced json block from a markdown body. */
export function extractJsonBlock(body) {
  const m = String(body ?? '').match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
