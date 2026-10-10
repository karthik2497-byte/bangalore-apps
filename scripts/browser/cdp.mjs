// Headless Chrome driver for scripts/browser-smoke.sh. usage: node cdp.mjs <suite.mjs> [--quiet]
// A suite: export default async (t) => { await t.goto(url); t.check(name, ok, detail); ... }
// Prints one line per check (failures only with --quiet), then app console errors.
// Exit 1 on any FAIL. Talks CDP over Node's built-in WebSocket: no npm install.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const prof = mkdtempSync(join(tmpdir(), 'smoke-chrome-'));  // fresh profile: no stale SW or storage
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let page;
for (let i = 0; i < 100 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {}
  if (!page) await sleep(100);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let nextId = 1; const pending = new Map(); const listeners = new Set();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else listeners.forEach(l => l(m));
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method, ms = 15000) => new Promise((res, rej) => {
  const to = setTimeout(() => { listeners.delete(l); rej(new Error('timeout waiting for ' + method)); }, ms);
  const l = m => { if (m.method === method) { clearTimeout(to); listeners.delete(l); res(m.params); } };
  listeners.add(l);
});

const logs = [];
listeners.add(m => {
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; logs.push('EXCEPTION ' + ((d.exception && d.exception.description) || d.text).split('\n')[0]); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
    logs.push(m.params.type.toUpperCase() + ' ' + m.params.args.map(a => a.value ?? a.description).join(' ').split('\n')[0]);
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
    logs.push('LOG ' + m.params.entry.text.split('\n')[0] + (m.params.entry.url ? ' @' + m.params.entry.url : ''));
});
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

const results = [];
const t = {
  sleep, send,
  async goto(url) { const l = once('Page.loadEventFired'); await send('Page.navigate', { url }); await l; await sleep(150); },
  async reload() { const l = once('Page.loadEventFired'); await send('Page.reload', { ignoreCache: false }); await l; await sleep(150); },
  async evaluate(fn, ...args) {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  },
  async grant(origin, permissions) { await send('Browser.grantPermissions', { origin, permissions }); },
  check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); },
  clearLogs() { logs.length = 0; },
  logs
};

const steps = (await import(pathToFileURL(resolve(process.argv[2])).href)).default;
let crashed = null;
try { await steps(t); } catch (e) { crashed = e; }
let fail = 0;
const quiet = process.argv.includes('--quiet');
for (const r of results) { if (!r.ok) fail++; if (quiet && r.ok) continue; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok && !r.detail ? '' : r.detail ? '  — ' + JSON.stringify(r.detail).slice(0, 300) : ''}`); }
if (crashed) { fail++; console.log('CRASH ' + crashed.message); }
const noise = /favicon|fonts\.g|ERR_INTERNET_DISCONNECTED|net::ERR_NAME/;
const shown = [...new Set(logs)].filter(l => !noise.test(l));
if (shown.length && (!quiet || fail)) { console.log('--- console (' + shown.length + ')'); shown.slice(0, 25).forEach(l => console.log('  ' + l.slice(0, 240))); }
console.log(`${fail ? 'FAIL' : 'PASS'} — ${results.length - fail}/${results.length} checks`);
ws.close(); cleanup(); process.exit(fail ? 1 : 0);
