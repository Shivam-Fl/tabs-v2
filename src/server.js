import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createGroup, addExpense, getExpenses, InvalidInputError } from './domain.js';
import { createStore } from './store.js';
import { splitEqual } from './money.js';

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
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
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

  // GET /api/groups/:id/expenses
  if (route.resource === 'group_expenses' && req.method === 'GET') {
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
    const expenses = getExpenses(group).map((exp) => {
      const shares = splitEqual(exp.amountPaise, exp.splitMemberIds);
      return { ...exp, shares };
    });
    return jsonResponse(res, 200, { group: { id: group.id, name: group.name }, expenses });
  }

  // POST /api/groups/:id/expenses
  if (route.resource === 'group_expenses' && req.method === 'POST') {
    const data = store.load();
    const group = data[route.groupId];
    if (!group) {
      return errorResponse(res, 'GROUP_NOT_FOUND', 'Group not found', 404);
    }
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
      const updatedGroup = addExpense(group, parsed);
      data[route.groupId] = updatedGroup;
      store.save(data);
      const expense = updatedGroup.expenses[updatedGroup.expenses.length - 1];
      const shares = splitEqual(expense.amountPaise, expense.splitMemberIds);
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
