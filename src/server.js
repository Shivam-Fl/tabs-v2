import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {
  createGroup,
  addExpense,
  getExpenses,
  recordSettlement,
  calculateBalances,
  calculateSettlement,
  InvalidInputError,
  SettlementDuplicateError,
} from './domain.js';
import { createStore, StoreUnreadableError } from './store.js';
import { splitEqual, splitByShares } from './money.js';

// Generous for a local JSON file, and overridable per process with HEALTH_TIMEOUT_MS for
// an operator whose mount is slow enough to need it. Read per request, not at module
// load, so a test can set it.
const HEALTH_TIMEOUT_MS = 2000;

let htmlCache = null;

function loadIndexHtml() {
  if (!htmlCache) {
    const indexPath = path.resolve('public', 'index.html');
    htmlCache = fs.readFileSync(indexPath, 'utf8');
  }
  return htmlCache;
}

function parseBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        // Do not req.destroy() here. Destroying the socket tears the connection down
        // before the route can write its 400, so the client sees a closed connection
        // and no status at all instead of an error response. Stop accumulating, let
        // the stream drain, and hand the rejection to the handler that answers.
        settled = true;
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!settled) resolve(body);
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, statusCode, data, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function htmlResponse(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html' });
  res.end(html);
}

function errorResponse(res, code, message, statusCode = 400) {
  jsonResponse(res, statusCode, { error: { code, message } });
}

// 503, not 500: the app is fine and its one dependency is not, and 503 is the status a
// probe or load balancer acts on. The message is fixed and the handler never reaches for
// err.message, so nothing from the store file can ride along in this body.
function storeUnreadableResponse(res) {
  return errorResponse(res, 'STORE_UNREADABLE', 'Group data store could not be read', 503);
}

// A health check that waits forever is not a health check. The store's own probe is async
// so a timer can still fire while it is in flight; racing it here is what turns a wedged
// disk into an answer. The timer is cleared in the finally because a pending one keeps
// the event loop alive and hangs `node --test` after the last case has run.
function withDeadline(promise) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new StoreUnreadableError(new Error('store check timed out'))),
      Number(process.env.HEALTH_TIMEOUT_MS) || HEALTH_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

function parseRoute(urlPath) {
  const pathname = url.parse(urlPath).pathname;
  // The group sub-resources are matched together, in the order the group screen reads
  // them. The order is not load-bearing — none of these patterns matches either of
  // the others' paths — but a reader looking for "what is under /api/groups/:id" gets all
  // of it in one block instead of finding /expenses and wondering what else is down here.
  // /api/groups/:id/balances
  const balancesMatch = pathname.match(/^\/api\/groups\/([^/]+)\/balances$/);
  if (balancesMatch) {
    return { resource: 'group_balances', groupId: balancesMatch[1] };
  }
  // /api/groups/:id/settlement
  const settlementMatch = pathname.match(/^\/api\/groups\/([^/]+)\/settlement$/);
  if (settlementMatch) {
    return { resource: 'group_settlement', groupId: settlementMatch[1] };
  }
  // /api/groups/:id/settlements — the write path. Deliberately a different path from the
  // singular one above rather than a POST on the same URL: one is a computed read, the
  // other appends to the ledger, and a client should not be able to confuse them.
  const settlementsMatch = pathname.match(/^\/api\/groups\/([^/]+)\/settlements$/);
  if (settlementsMatch) {
    return { resource: 'group_settlements', groupId: settlementsMatch[1] };
  }
  // /api/groups/:id/expenses
  const expenseMatch = pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
  if (expenseMatch) {
    return { resource: 'group_expenses', groupId: expenseMatch[1] };
  }
  // /api/groups
  if (pathname === '/api/groups') {
    return { resource: 'groups' };
  }
  if (pathname === '/') {
    return { resource: 'index' };
  }
  if (pathname === '/healthz') {
    return { resource: 'healthz' };
  }
  return null;
}

async function handleRequest(req, res, store) {
  const route = parseRoute(req.url);

  if (!route) {
    return jsonResponse(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  }

  // GET /
  if (route.resource === 'index' && req.method === 'GET') {
    return htmlResponse(res, 200, loadIndexHtml());
  }
  // Method mismatch for known routes
  if (route.resource === 'index' && req.method !== 'GET') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // GET /healthz — the one route that asks the store a question instead of assuming.
  if (route.resource === 'healthz') {
    if (req.method !== 'GET') {
      return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    }
    try {
      await withDeadline(store.check());
    } catch {
      // Deliberately empty of detail, including for a failure we never classified: a
      // store this process cannot interrogate is one it cannot vouch for either way.
      return storeUnreadableResponse(res);
    }
    return jsonResponse(res, 200, { status: 'ok' });
  }

  // GET /api/groups
  if (route.resource === 'groups' && req.method === 'GET') {
    const data = store.load();
    const groups = Object.values(data);
    return jsonResponse(res, 200, { groups });
  }

  // POST /api/groups
  if (route.resource === 'groups' && req.method === 'POST') {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Request body too large', 400);
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Invalid JSON', 400);
    }
    try {
      const group = createGroup(parsed);
      const data = store.load();
      // The client's busy flag only covers one tab. Two tabs, a replayed request or a
      // direct API call all arrive here, and `group.name` had no uniqueness constraint,
      // so each of them persisted another group with the same name. Compared on the
      // trimmed, case-folded name: 'Goa Trip' and ' goa trip ' are one group to the
      // user who typed them, and showing both is the duplicate the ticket is about.
      const normalizedName = group.name.toLowerCase();
      const duplicate = Object.values(data).find(
        (existing) => existing.name.trim().toLowerCase() === normalizedName,
      );
      if (duplicate) {
        return errorResponse(res, 'GROUP_NAME_TAKEN', 'A group with this name already exists', 400);
      }
      data[group.id] = group;
      store.save(data);
      return jsonResponse(res, 201, { group });
    } catch (err) {
      if (err instanceof InvalidInputError) {
        return errorResponse(res, err.code, err.message, 400);
      }
      // Before the generic branch, and only here: this is the one call site whose
      // store.load() sits inside a try, so the outer catch in start() never sees it.
      if (err instanceof StoreUnreadableError) {
        return storeUnreadableResponse(res);
      }
      return errorResponse(res, 'INTERNAL', err.message, 500);
    }
  }

  if (route.resource === 'groups') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // GET /api/groups/:id/balances
  if (route.resource === 'group_balances' && req.method === 'GET') {
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    try {
      return jsonResponse(res, 200, { balances: calculateBalances(group) });
    } catch (err) {
      // The invariant from project.md, not a bad request: the body of the group on disk
      // is inconsistent, and the client cannot fix it by sending something different.
      return errorResponse(res, 'BALANCES_INVARIANT', err.message, 500);
    }
  }

  if (route.resource === 'group_balances') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // GET /api/groups/:id/settlement
  if (route.resource === 'group_settlement' && req.method === 'GET') {
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    try {
      const balances = calculateBalances(group);
      return jsonResponse(res, 200, {
        // `settlement` keeps its name and its meaning: the transfers still outstanding.
        // `recorded` is the other half of the panel — what has already been done — and is
        // read off the group rather than derived, because a done transfer is a fact about
        // the past, not a conclusion from the current balances.
        settlement: calculateSettlement(balances, group.members),
        recorded: group.settlements || [],
      });
    } catch (err) {
      // The same code as /balances on purpose. The settlement is derived from the same
      // balances, so the same corrupt group must not look like a different failure — or,
      // worse, like an internal bug — depending on which URL it was read through.
      return errorResponse(res, 'BALANCES_INVARIANT', err.message, 500);
    }
  }

  if (route.resource === 'group_settlement') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // POST /api/groups/:id/settlements
  if (route.resource === 'group_settlements' && req.method === 'POST') {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Request body too large', 400);
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Invalid JSON', 400);
    }
    // The store is read here — after the last await in this handler — and written back
    // below with nothing in between that can yield, exactly as in the expense write. This
    // handler was added after that fix and reintroduced its shape: reading the store before
    // `parseBody` let two concurrent settlements load the same snapshot, each append its
    // own entry to its own copy, and the second save drop the first. It also defeated the
    // duplicate check, which reads the same snapshot and so saw neither entry.
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    try {
      const updatedGroup = recordSettlement(group, parsed);
      // The same shape as the expense write: record, then hand back the entry that was
      // appended. Nothing is derived here, so nothing can throw between the write and the
      // response and leave the store holding an entry the client never saw.
      const settlement = updatedGroup.settlements[updatedGroup.settlements.length - 1];
      data[route.groupId] = updatedGroup;
      store.save(data);
      return jsonResponse(res, 201, { settlement });
    } catch (err) {
      if (err instanceof InvalidInputError) {
        return errorResponse(res, err.code, err.message, 400);
      }
      // 409, not 400: the request was fine and the settlement is real, but this exact one
      // is already on the ledger. The client shows the message and stops; the entry it
      // tried to duplicate is untouched either way.
      if (err instanceof SettlementDuplicateError) {
        return errorResponse(res, err.code, err.message, 409);
      }
      return errorResponse(res, 'INTERNAL', err.message, 500);
    }
  }

  if (route.resource === 'group_settlements') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // GET /api/groups/:id/expenses
  if (route.resource === 'group_expenses' && req.method === 'GET') {
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    const expenses = getExpenses(group).map((exp) => {
      // `splitShares` is the stored input (share counts); `shares` is the computed
      // output (paise per member). An expense without splitShares is an equal split —
      // including every expense written before shares existed.
      const shares = exp.splitShares
        ? splitByShares(exp.amountPaise, exp.splitShares)
        : splitEqual(exp.amountPaise, exp.splitMemberIds);
      return { ...exp, shares };
    });
    // The UI builds the payer select, the split checkboxes and every share
    // label from `group.members`; sending only id+name left it unable to render.
    return jsonResponse(res, 200, { group, expenses });
  }

  // POST /api/groups/:id/expenses
  if (route.resource === 'group_expenses' && req.method === 'POST') {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Request body too large', 400);
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return errorResponse(res, 'INVALID_JSON', 'Invalid JSON', 400);
    }
    // The store is read here — after the last await in this handler — and written back
    // below with nothing in between that can yield. Reading it before `parseBody` let two
    // requests load the same snapshot, each append its own expense, and the second save
    // drop the first: two 201s, one expense. Node runs this span to completion once it
    // starts, which is what makes the read-modify-write atomic here; there is no lock
    // because there is no longer a gap to guard.
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    try {
      const updatedGroup = addExpense(group, parsed);
      const expense = updatedGroup.expenses[updatedGroup.expenses.length - 1];
      // Compute the shares before the write: anything that throws in between
      // would otherwise commit an expense that every later read fails on.
      const shares = expense.splitShares
        ? splitByShares(expense.amountPaise, expense.splitShares)
        : splitEqual(expense.amountPaise, expense.splitMemberIds);
      data[route.groupId] = updatedGroup;
      store.save(data);
      return jsonResponse(res, 201, { expense: { ...expense, shares } });
    } catch (err) {
      if (err instanceof InvalidInputError) {
        return errorResponse(res, err.code, err.message, 400);
      }
      return errorResponse(res, 'INTERNAL', err.message, 500);
    }
  }

  if (route.resource === 'group_expenses') {
    return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }
}

export function start({ port, store }) {
  const activeStore = store || createStore();

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, activeStore);
    } catch (err) {
      // The six data routes call store.load() outside any try of their own, so this
      // catch is where an unreadable store surfaces for them. Without this branch they
      // answered 500 INTERNAL carrying the JSON.parse text, which quotes a fragment of
      // the data file straight back to the client.
      if (err instanceof StoreUnreadableError) {
        return storeUnreadableResponse(res);
      }
      errorResponse(res, 'INTERNAL', err.message, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      resolve({
        close: () => server.close(),
        url: `http://localhost:${addr.port}`,
      });
    });
  });
}

export default { start };

// Boot when run directly
if (process.argv[1] === url.fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const store = createStore();
  start({ port, store }).then(({ url: serverUrl }) => {
    console.log(`Tabs listening on ${serverUrl}`);
  });
}
