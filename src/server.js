import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {
  createGroup,
  addExpense,
  getExpenses,
  calculateBalances,
  calculateSettlement,
  InvalidInputError,
} from './domain.js';
import { createStore } from './store.js';
import { splitEqual, splitByShares } from './money.js';

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

function parseRoute(urlPath) {
  const pathname = url.parse(urlPath).pathname;
  // The three group sub-resources are matched together, in the order the group screen
  // reads them. The order is not load-bearing — none of these patterns matches either of
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

  // GET /healthz
  if (route.resource === 'healthz') {
    if (req.method !== 'GET') {
      return errorResponse(res, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
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
        settlement: calculateSettlement(balances, group.members),
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
