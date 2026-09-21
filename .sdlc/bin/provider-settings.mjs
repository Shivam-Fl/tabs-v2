#!/usr/bin/env node
// The `settings` JSON that points Claude Code at a model provider.
//
// `runtime.model.<stage>` already chooses a model per step. What it could not do is choose a
// PROVIDER: the base URL, the key and any headers that provider demands live outside the
// model name, and hardcoding them in fourteen workflows is fourteen places to get wrong.
//
// Empty config means the default Anthropic endpoint and the action's own OAuth token, which
// is what every repo had before this existed — so a repo that sets nothing behaves exactly
// as it did.
//
// Header names matter more than they look. OpenCode Go rejects `Authorization: Bearer` with
// "Missing API key" and requires `x-api-key`, which is what ANTHROPIC_API_KEY sends and
// ANTHROPIC_AUTH_TOKEN does not. It also requires `x-opencode-session` on every request and
// answers a missing one with an opaque 500 on its Anthropic endpoint — a 400 wearing the
// wrong number, which costs an hour if you assume the model is down.

import { loadConfig, setOutput } from './lib/actions.js';

const cfg = await loadConfig();
const p = cfg.runtime?.provider ?? {};

const env = {};
if (p.base_url) env.ANTHROPIC_BASE_URL = p.base_url;

// A stable id per conversation, which for this pipeline is one workflow run. Providers use
// it for routing and prompt caching; one shared constant would pool every issue's context.
if (p.headers && typeof p.headers === 'object') {
  const run = process.env.GITHUB_RUN_ID ?? String(Date.now());
  env.ANTHROPIC_CUSTOM_HEADERS = Object.entries(p.headers)
    .map(([k, v]) => `${k}: ${String(v).replace('{run}', run)}`)
    .join('\n');
}

setOutput('settings', JSON.stringify(Object.keys(env).length ? { env } : {}));
setOutput('uses_provider', p.base_url ? 'true' : 'false');
