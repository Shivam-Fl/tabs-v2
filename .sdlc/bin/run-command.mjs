#!/usr/bin/env node
// Executes an authorized /sdlc command. parseCommand already proved the author may do this.
import { gh, die, repo as repoOf } from './lib/actions.js';
import { advance } from './lib/advance.js';
import { routeOf } from './lib/route-io.js';
import { dispatchFor, loadGraph } from './lib/flow-graph.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const cmd = process.env.COMMAND;
const issue = process.env.ISSUE;
const ctl = (...args) => exec('node', ['.sdlc/bin/sdlc-ctl.mjs', ...args]);

switch (cmd) {
  case 'approve': {
    // "Approved" used to mean exactly one thing — start the implementer — because there was
    // one gate and one chain. There are several gates now, and the route says what follows
    // each. The stage that stopped the issue recorded itself; this continues from there.
    await gh(['issue', 'edit', issue, '--remove-label', 'sdlc:plan-review']).catch(() => {});
    const { ledger } = await routeOf(repoOf(), issue);

    // The merge gate is the one where "continue the route" is the wrong reading: there is
    // nothing after QA to start, and the thing being approved is the merge itself. This used
    // to re-dispatch the implementer on code QA had just passed.
    if (ledger?.state === 'qa-pass' && ledger?.pr) {
      const run = await exec('node', ['.sdlc/bin/merge-pr.mjs'], {
        env: { ...process.env, PR: String(ledger.pr), ISSUE: String(issue), HUMAN_APPROVED: 'true' },
      }).catch((e) => ({ stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? e.message ?? ''), crashed: true }));
      process.stdout.write(run.stdout);
      if (run.stderr) process.stdout.write(run.stderr);

      // merge-pr refuses loudly and exits clean when a claim does not re-establish, so a
      // refusal has to be reported here rather than read as success.
      if (!/^merged PR/m.test(run.stdout)) {
        // A refusal and a crash are different things to tell someone, and the message they
        // read has to say which. Reporting the last three lines of whatever came back put a
        // JavaScript stack trace's tail — "}", "", "Node.js v22.23.2" — under the words "one
        // of them did not hold", which names no claim and describes nothing that happened.
        // merge-pr comments the refusal itself, on whichever path it ran — the auto-merge
        // step in sdlc-qa reads none of its outputs, so reporting from the caller only ever
        // covered `/sdlc approve`. A CRASH is still ours: stop() does not run when the
        // process dies, so nothing else can say that nothing was judged.
        const refused = /^not merging: /m.test(run.stdout);
        if (!refused) {
          const noise = /^\s*(at\s|node:internal|\^|\}|\{|Node\.js v|code:|killed:|signal:|cmd:|stdout:|stderr:|const err|\s*$)/;
          const cause = (run.stderr || run.stdout).split('\n')
            .map((l) => l.replace(/^Error: Command failed:.*$/, '').trim())
            .filter((l) => l && !noise.test(l))
            .slice(0, 6).join('\n');
          await gh(['issue', 'comment', issue, '--body',
            '## Not merged — the merge step itself failed\n\nThis is not a refusal: no claim was ' +
            'judged, the tool that judges them did not finish. The PR is untouched.\n\n' +
            `\`\`\`\n${cause || '(nothing readable came back)'}\n\`\`\`\n\n` +
            'Comment `/sdlc approve` to try again once the cause above is addressed.']);
        }
      }
      break;
    }

    // The stage that stopped the issue already worked out what comes next — a gate resumes
    // AFTER itself, a crash resumes BY RUNNING ITSELF AGAIN, and only the thing that stopped
    // it knows which happened. Approving is a dispatch, not a deduction.
    const resume = ledger?.resume_at;

    // Nothing recorded AND no route means intake stopped this before the Router ever ran —
    // an untrusted reporter, a risk area, a bug with no repro steps. Every one of those stops
    // ends by telling a maintainer to type `/sdlc approve`, so it has to do something: it
    // re-runs intake with the stop overridden, which then routes the issue normally.
    if (!resume && !ledger?.planned_route?.length) {
      await gh(['workflow', 'run', 'sdlc-intake.yml', '-f', `issue=${issue}`, '-f', 'approved=true']);
      await gh(['issue', 'comment', issue, '--body',
        'Approved — re-running intake with the stop overridden. It will say what it would have ' +
        'stopped for, and then route this normally.']);
      break;
    }

    if (!resume) {
      await gh(['issue', 'comment', issue, '--body',
        'Approved, but this issue has a route and nothing recorded where to resume it, so there ' +
        'is nothing to dispatch that would not be a guess. `/sdlc retry planning` starts it again ' +
        'from the plan, `/sdlc replan "<why>"` re-routes it.']);
      break;
    }

    const d = dispatchFor(resume, { issue, pr: ledger?.pr ?? null });
    if (!d) {
      await gh(['issue', 'comment', issue, '--body',
        `Approved, and \`${resume}\` cannot be started: ` +
        `${loadGraph().stages[resume]?.input === 'pr' ? 'it runs on a pull request and this issue has none' : 'the stage graph does not know it'}.`]);
      break;
    }
    await advance(issue, d.state, { agent: 'human' });
    await exec('node', ['.sdlc/bin/dispatch.mjs', d.workflow, ...d.args]);
    await gh(['issue', 'comment', issue, '--body',
      `Approved${ledger.stopped_at ? ` at \`${ledger.stopped_at}\`` : ''}. Starting \`${resume}\`.`]);
    break;
  }

  case 'reject':
    await advance(issue, 'planning', { agent: 'human', alsoRemove: ['sdlc:plan-review'] });
    await gh(['workflow', 'run', 'sdlc-plan.yml', '-f', `issue=${issue}`]);
    await gh(['issue', 'comment', issue, '--body', 'Work order rejected — replanning with the feedback above.']);
    break;

  case 'retry': {
    // `retry` after a budget stop must clear the counters, or it dispatches straight back
    // into the cap it just hit. Target state comes from the argument so the same command
    // works whether the issue died at planning or at implementation.
    const to = process.env.ARGS?.trim() || 'implementing';
    await ctl('reset', '--issue', issue, '--to', to);
    const workflow = to === 'planning' ? 'sdlc-plan.yml' : 'sdlc-implement.yml';
    await advance(issue, to, { agent: 'human' });
    await gh(['workflow', 'run', workflow, '-f', `issue=${issue}`]);
    await gh(['issue', 'comment', issue, '--body',
      `Attempt counters cleared and restarted at **${to}**. The budget is full again — ` +
      'if it stops here a second time, the cause is worth reading before retrying.']);
    break;
  }

  case 'replan': {
    // The human's note is the whole point: they are overruling a decision a machine made, and
    // re-running the same rules on the same text would produce the same answer. So the note
    // is posted where the Router will read it, and the fast path is skipped — a rule that
    // already fired once and was wrong does not get a second go at being right.
    const why = (process.env.ARGS ?? '').trim().replace(/^["']|["']$/g, '');
    if (!why) {
      await gh(['issue', 'comment', issue, '--body',
        '`/sdlc replan` needs a reason: `/sdlc replan "this is bigger than a typo"`. ' +
        'The reason is what the Router reads — without it this is just the same decision again.']);
      break;
    }
    await gh(['issue', 'comment', issue, '--body',
      `## Route note from @${process.env.GITHUB_ACTOR ?? 'a maintainer'}\n\n${why}\n\n` +
      '_Re-routing. The Router reads this note as context; the deterministic rules are skipped, ' +
      'because one of them already answered and a person disagreed._']);
    await gh(['workflow', 'run', 'sdlc-intake.yml', '-f', `issue=${issue}`, '-f', 'replan=true']);
    break;
  }

  case 'replan-epic': {
    const why = (process.env.ARGS ?? '').trim().replace(/^["']|["']$/g, '');
    await gh(['issue', 'comment', issue, '--body',
      `## Re-split requested by @${process.env.GITHUB_ACTOR ?? 'a maintainer'}\n\n` +
      (why || 'No reason given — the maintainer will apply the clubbing test to every adjacent pair.') +
      '\n\n_The re-run reads the issues this epic already has and clubs them; it does not ' +
      'create a second set._']);
    await gh(['workflow', 'run', 'sdlc-maintainer.yml', '-f', `epic=${issue}`, '-f', 'resplit=true']);
    break;
  }

  case 'replan-project': {
    // A pivot, not a correction: the ADRs are numbered on from what is already there rather
    // than overwriting the ones that explain what is being pivoted away from.
    const why = (process.env.ARGS ?? '').trim().replace(/^["']|["']$/g, '');
    await gh(['issue', 'comment', issue, '--body',
      `## Architecture re-decision requested by @${process.env.GITHUB_ACTOR ?? 'a maintainer'}\n\n` +
      (why || 'No reason given.') +
      '\n\n_The existing ADRs are kept and the new ones numbered on from them — what is being ' +
      'pivoted away from is worth as much as what replaces it._']);
    await gh(['workflow', 'run', 'sdlc-project.yml', '-f', `issue=${issue}`, '-f', `note=${why}`]);
    break;
  }

  case 'stop':
    await advance(issue, 'needs-human', { agent: 'human' });
    await ctl('unlock', '--issue', issue);
    await gh(['issue', 'comment', issue, '--body', 'Halted. No agent will pick this up until a label moves it.']);
    break;

  case 'override':
    // Recorded, never silent: an override that leaves no trace is indistinguishable from a bug.
    await gh(['issue', 'comment', issue, '--body',
      '⚠️ Gate overridden by @' + (process.env.GITHUB_ACTOR ?? 'unknown') + '. Recorded in the ledger.']);
    break;

  case 'status': {
    const { stdout } = await ctl('status', '--issue', issue);
    await gh(['issue', 'comment', issue, '--body', '```json\n' + stdout + '\n```']);
    break;
  }

  default:
    die('unhandled command "' + cmd + '"');
}
