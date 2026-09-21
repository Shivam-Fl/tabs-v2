#!/usr/bin/env node
// Resolves, for one issue: which agent plans it, and how much deliberation it gets.
// Emitted as step outputs so the workflow's conditions stay readable.
import { ghJson, setOutput, loadConfig, repo as repoOf } from './lib/actions.js';
import { agentForIssue, councilFor } from './lib/routing.js';
import { readLedger } from './lib/state-io.js';

const issue = process.env.ISSUE;
const cfg = await loadConfig();
const data = await ghJson(['issue', 'view', issue, '--json', 'labels,title']);

const agent = agentForIssue({ labels: data.labels }, cfg);

// The Router may ask for LESS deliberation on a ticket that does not need it — a council is
// for plans that are expensive to get wrong, and a wording change is not one. It may only
// ask downward: turning a single pass into a council costs three times as much on a ticket a
// cheap model classified, which is the wrong direction for a cheap model to be able to push.
const { ledger } = await readLedger(repoOf(), Number(issue)).catch(() => ({ ledger: null }));
const asked = ledger?.flow_plan?.councils?.plan;
const configured = councilFor('plan', cfg).length > 1 ? 'council' : 'single';
const mode = asked === 'single' ? 'single' : configured;
if (asked && asked !== configured) {
  process.stdout.write(
    `the route asked for a ${asked} plan and config says ${configured} — using ${mode}` +
    `${asked === 'council' ? ' (a route may reduce deliberation, never add cost)' : ''}\n`);
}
const stages = mode === 'council' ? councilFor('plan', { ...cfg, councils: { ...cfg.councils, plan: 'council' } }) : [{ role: 'plan' }];

// A bug is diagnosed by reproducing it, not by debating a plan for it — the debugger owns
// the investigation, and a council of three static readers adds cost without adding evidence.
const effectiveMode = agent === 'debugger' ? 'single' : mode;
void stages;

setOutput('agent', agent);
setOutput('mode', effectiveMode);
setOutput('pack', agent === 'debugger' ? 'debugger.md' : 'planner.md');
process.stdout.write(`#${issue} "${data.title}" -> ${agent} (${effectiveMode})\n`);
