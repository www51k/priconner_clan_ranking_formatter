import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

class Cdp {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data.toString());
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result ?? {});
    });
    return {
      call(method, params = {}) {
        const id = ++nextId;
        return new Promise((resolveCall, rejectCall) => {
          pending.set(id, { resolve: resolveCall, reject: rejectCall });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { socket.close(); },
    };
  }
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
if (outputIndex < 0 || !args[outputIndex + 1]) {
  throw new Error('Usage: node formatter-batch.mjs --output <png-path> [--rank-start <rank>] <image-path>...');
}
const outputPath = resolve(args[outputIndex + 1]);
const rankStartIndex = args.indexOf('--rank-start');
const rankStart = rankStartIndex >= 0 ? Number.parseInt(args[rankStartIndex + 1], 10) : 1;
const excludedIndexes = new Set([outputIndex, outputIndex + 1]);
if (rankStartIndex >= 0) {
  excludedIndexes.add(rankStartIndex);
  excludedIndexes.add(rankStartIndex + 1);
}
const imagePaths = args.filter((_, index) => !excludedIndexes.has(index)).map((arg) => resolve(arg));
if (!imagePaths.length) throw new Error('At least one input image is required.');
if (!Number.isInteger(rankStart) || rankStart < 1 || rankStart + imagePaths.length - 1 > 30) {
  throw new Error('Input rank range must be within 1–30.');
}

const root = resolve(import.meta.dirname);
const dist = resolve(root, 'dist');
const edgePath = await findEdge();
const profile = await mkdtemp(join(tmpdir(), 'priconne-formatter-profile-'));
const downloadDir = await mkdtemp(join(tmpdir(), 'priconne-formatter-download-'));
await access(join(dist, 'index.html'));
for (const imagePath of imagePaths) await access(imagePath);

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = resolve(dist, `.${requestPath === '/' ? '/index.html' : requestPath}`);
    if (candidate !== dist && !candidate.startsWith(dist + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const contents = await readFile(candidate);
    response.writeHead(200, { 'Content-Type': mimeType(candidate), 'Cache-Control': 'no-store' });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

let browser;
let browserCdp;
let pageCdp;
try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const devToolsPort = await findFreePort();
  const pageUrl = `http://127.0.0.1:${address.port}/?batch`;
  browser = spawn(edgePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', `--remote-debugging-port=${devToolsPort}`,
    `--user-data-dir=${profile}`, pageUrl,
  ], { windowsHide: true, stdio: 'ignore' });

  const version = await waitForJson(`http://127.0.0.1:${devToolsPort}/json/version`, 30000);
  browserCdp = await Cdp.connect(version.webSocketDebuggerUrl);
  await browserCdp.call('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true,
  });
  const targets = await waitForJson(`http://127.0.0.1:${devToolsPort}/json/list`, 30000);
  const page = targets.find((target) => target.type === 'page' && target.url === pageUrl);
  if (!page) throw new Error('Formatter page did not open in Edge.');
  pageCdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await pageCdp.call('Runtime.enable');
  await waitForCondition(async () => (await evaluate(pageCdp, 'document.readyState')) === 'complete', 30000);
  await waitForCondition(async () => await evaluate(pageCdp, 'typeof window.__formatterBatchCompose === "function"'), 30000,
    'Formatter batch compositor was not initialized.');

  const cards = await Promise.all(imagePaths.map(async (imagePath, index) => ({
    name: imagePath.split(/[\\/]/).at(-1),
    rank: rankStart + index,
    dataUrl: `data:image/png;base64,${(await readFile(imagePath)).toString('base64')}`,
  })));
  const status = await evaluate(pageCdp, `window.__formatterBatchCompose(${JSON.stringify(cards)})`);
  if (status?.rankCount !== imagePaths.length) {
    throw new Error(`Formatter composed ${status?.rankCount ?? 0} ranks from ${imagePaths.length} input cards.`);
  }
  const downloaded = await waitForDownload(downloadDir, 30000);
  await stat(downloaded);
  await copyFile(downloaded, outputPath);
  process.stdout.write(`${JSON.stringify({ output: outputPath, rankCount: status.rankCount })}\n`);
} finally {
  pageCdp?.close();
  browserCdp?.close();
  if (browser?.pid && process.platform === 'win32') {
    await new Promise((resolveKill) => {
      const killer = spawn('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.once('exit', resolveKill);
      killer.once('error', resolveKill);
    });
  } else if (browser && !browser.killed) {
    browser.kill();
  }
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  await rm(downloadDir, { recursive: true, force: true }).catch(() => {});
}

async function findEdge() {
  const candidates = [
    process.env.PRICONNE_EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error('Microsoft Edge was not found. Set PRICONNE_EDGE_PATH to msedge.exe.');
}

function mimeType(filePath) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' })[extname(filePath)] ?? 'application/octet-stream';
}

async function findFreePort() {
  const socket = createTcpServer();
  await new Promise((resolveListen, rejectListen) => {
    socket.once('error', rejectListen);
    socket.listen(0, '127.0.0.1', resolveListen);
  });
  const port = socket.address().port;
  await new Promise((resolveClose) => socket.close(resolveClose));
  return port;
}

async function waitForJson(url, timeoutMs = 30000) {
  return await waitForCondition(async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch { return null; }
  }, timeoutMs, `Could not connect to ${url}.`);
}

async function waitForCondition(predicate, timeoutMs, message = 'Timed out waiting for formatter.') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(message);
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Formatter script failed.');
  return result.result.value;
}

async function waitForDownload(directory, timeoutMs) {
  return await waitForCondition(async () => {
    const names = await readdir(directory);
    if (names.some((name) => name.endsWith('.crdownload'))) return null;
    const match = names.find((name) => /^priconne_clan_ranking_.*\.png$/i.test(name));
    return match ? join(directory, match) : null;
  }, timeoutMs, 'Formatter did not download its output PNG.');
}
