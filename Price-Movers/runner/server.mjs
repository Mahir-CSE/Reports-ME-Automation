// Test runner: a local web page to enter inputs and run each part of the flow.
// Start with:  npm run runner     (opens http://localhost:4321)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RUNNER_PORT ?? 4321);
const INPUTS_FILE = path.join(ROOT, 'runner', 'inputs.json');
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
const SPEC = 'tests/e2e-flow.spec.ts';

let proc = null;          // running Playwright process
let history = [];         // events of the current/last run (replayed to new page loads)
const clients = new Set(); // SSE connections

// ---------- helpers ----------

function readEnvFile() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
    }
  } catch { /* no .env */ }
  return env;
}

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function defaultInputs() {
  const env = readEnvFile();
  const s = Math.floor(100000 + Math.random() * 900000);
  const initialDates = [isoDaysAgo(0), isoDaysAgo(1), isoDaysAgo(2)]; // Initial Review: today, yesterday, day before
  const reconDates = [isoDaysAgo(3), isoDaysAgo(4), isoDaysAgo(5)];    // Reconciliation: a different, earlier date
  return {
    baseUrl: env.BASE_URL ?? '',
    username: env.TEST_USERNAME ?? '',
    password: env.TEST_PASSWORD ?? '',
    vendorName: `Vendor-QA-${s}`,
    productName: `Test-Product-${s}`,
    productCategory: 'Baked Goods',
    productQuantity: '1',
    productPrice: '10',
    vendorItem1: `VI-QA-${s}-1`,
    vendorItem2: `VI-QA-${s}-2`,
    item1InitialDates: [...initialDates],
    item1ReconDates: [...reconDates],
    item2InitialDates: [...initialDates],
    item2ReconDates: [...reconDates],
  };
}

function loadInputs() {
  try {
    return { ...defaultInputs(), ...JSON.parse(fs.readFileSync(INPUTS_FILE, 'utf8')) };
  } catch {
    return defaultInputs();
  }
}

/** "1".."5" = a whole part, "5.3" = one order of Part 5 → Playwright --grep regex */
function grepFor(targets) {
  const parts = targets.map((t) => {
    const [part, order] = String(t).split('.');
    if (!/^[1-5]$/.test(part)) throw new Error(`Unknown part "${t}"`);
    if (order) {
      if (!/^[1-6]$/.test(order)) throw new Error(`Unknown order "${t}"`);
      return `Part 5 - Order ${order} \\(`;
    }
    return `Part ${part} - `;
  });
  return parts.join('|');
}

function broadcast(msg) {
  if (msg.type !== 'log' || history.length < 5000) history.push(msg);
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(data);
}

function startRun({ targets, inputs, slowmo }) {
  if (proc) throw new Error('A run is already in progress');
  fs.writeFileSync(INPUTS_FILE, JSON.stringify(inputs, null, 2));

  const args = [PLAYWRIGHT_CLI, 'test', SPEC, '--headed', '--reporter=./runner/live-reporter.ts,list'];
  if (targets && targets.length && !targets.includes('all')) args.push('--grep', grepFor(targets));

  const { baseUrl, username, password, ...testInputs } = inputs;
  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    TEST_USERNAME: username,
    TEST_PASSWORD: password,
    TEST_INPUTS: JSON.stringify(testInputs),
    SLOWMO: String(slowmo ?? 0),
    PLAYWRIGHT_HTML_OPEN: 'never',
    FORCE_COLOR: '0',
  };

  history = [];
  broadcast({ type: 'runStart', targets: targets ?? ['all'], at: Date.now() });
  proc = spawn(process.execPath, args, { cwd: ROOT, env });

  const onData = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith('@@RUNNER@@')) {
        try { broadcast({ type: 'event', event: JSON.parse(line.slice(10)) }); } catch { /* ignore */ }
      } else {
        broadcast({ type: 'log', line });
      }
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('close', (code) => {
    broadcast({ type: 'runEnd', code });
    proc = null;
  });
}

function stopRun() {
  if (!proc) return;
  broadcast({ type: 'log', line: '■ Stopped by user' });
  if (process.platform === 'win32') exec(`taskkill /pid ${proc.pid} /T /F`);
  else proc.kill('SIGTERM');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}

// The page may be opened from VS Code Live Server (Go Live, e.g. http://127.0.0.1:5500), so allow cross-origin calls.
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.zip': 'application/zip' };

function serveStatic(res, baseDir, relPath) {
  const file = path.normalize(path.join(baseDir, relPath));
  if (!file.startsWith(baseDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return serveStatic(res, ROOT, 'test-runner.html');
    }
    if (req.method === 'GET' && url.pathname === '/api/inputs') {
      return send(res, 200, { saved: loadInputs(), fresh: defaultInputs(), running: !!proc });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      for (const msg of history) res.write(`data: ${JSON.stringify(msg)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      startRun(await readBody(req));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      stopRun();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/report')) {
      const rel = decodeURIComponent(url.pathname.replace(/^\/report\/?/, '')) || 'index.html';
      return serveStatic(res, path.join(ROOT, 'playwright-report'), rel);
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`Test runner ready at ${link}  (Ctrl+C to stop)`);
  if (!process.env.RUNNER_NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${link}"` : process.platform === 'darwin' ? `open "${link}"` : `xdg-open "${link}"`;
    exec(cmd);
  }
});
