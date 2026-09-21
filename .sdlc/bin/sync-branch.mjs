#!/usr/bin/env node
// Brings a PR's branch up to date with its base before anything reads the diff.
//
// A review reads `base...head`. If base has moved since the branch was cut, that diff contains
// every change base gained — as deletions and reversions, attributed to this branch.
//
// That is not hypothetical. The framework was updated on `main` while an agent's PR was open,
// and the next review found "~900 lines of pipeline infrastructure change including a policy
// flip, hidden inside a feature PR" and blocked on scope. The finding was exactly right about
// what the diff showed, and the branch had not touched any of those files. The implementer was
// then dispatched to answer a finding it could only have satisfied by deleting work someone
// else had done.
//
// Cheap to prevent, expensive to diagnose: a stale base makes an honest reviewer produce a
// confident false blocker, and the agent answering it has no way to tell.
import { gh, ghJson, setOutput } from './lib/actions.js';

const pr = process.env.PR;
if (!pr) { setOutput('updated', 'false'); process.exit(0); }

const info = await ghJson(['pr', 'view', pr, '--json', 'headRefName,baseRefName,state'])
  .catch(() => null);
if (!info || info.state !== 'OPEN') { setOutput('updated', 'false'); process.exit(0); }

const repo = process.env.GITHUB_REPOSITORY;
const cmp = await ghJson(['api', `repos/${repo}/compare/${info.baseRefName}...${info.headRefName}`])
  .catch(() => null);
if (!cmp) { setOutput('updated', 'false'); process.exit(0); }

if (!cmp.behind_by) {
  process.stdout.write(`PR #${pr} is up to date with ${info.baseRefName}\n`);
  setOutput('updated', 'false');
  process.exit(0);
}

process.stdout.write(`PR #${pr} is ${cmp.behind_by} commit(s) behind ${info.baseRefName} — updating\n`);
try {
  await gh(['api', `repos/${repo}/pulls/${pr}/update-branch`, '-X', 'PUT']);
  setOutput('updated', 'true');
  process.stdout.write('branch updated; the diff now shows only this branch\'s own changes\n');
} catch (e) {
  // A conflict is a real finding and belongs to the implementer, not to a reviewer reading a
  // diff that cannot be trusted. Said out loud rather than swallowed, because a review that
  // proceeds here will blame this branch for whatever base changed.
  const detail = String(e.stderr || e.message).split('\n')[0];
  process.stdout.write(`::warning::could not update PR #${pr} from ${info.baseRefName}: ${detail}\n`);
  await gh(['pr', 'comment', pr, '--body',
    `This branch is ${cmp.behind_by} commit(s) behind \`${info.baseRefName}\` and cannot be ` +
    'updated automatically — most likely a merge conflict.\n\n' +
    'Whatever reads this diff next will see every change the base gained as a deletion on this ' +
    'branch, and will attribute it here. Resolve the conflict before trusting a review of it.']).catch(() => {});
  setOutput('updated', 'conflict');
}
