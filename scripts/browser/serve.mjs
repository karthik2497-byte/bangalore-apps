// Static server for the repo root that applies _headers the way Pages does
// (rules additive, duplicate headers comma-joined, `! Name` detaches).
// usage: node serve.mjs <repoRoot> <port>   (started by scripts/browser-smoke.sh)
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const [root, port = 8811] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.opus': 'audio/ogg', '.css': 'text/css',
  '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain' };

function rules() {
  const out = []; let cur = null;
  for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { cur = { pat: line.trim(), hs: [] }; out.push(cur); continue; }
    const t = line.trim();
    if (t.startsWith('!')) cur.hs.push({ del: t.slice(1).trim().toLowerCase() });
    else { const i = t.indexOf(':'); cur.hs.push({ k: t.slice(0, i).trim(), v: t.slice(i + 1).trim() }); }
  }
  return out;
}
const match = (pat, p) => pat.endsWith('*') ? p.startsWith(pat.slice(0, -1)) : p === pat;

createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, p));
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end('404'); return; }
  const headers = {};
  for (const r of rules()) if (match(r.pat, p)) for (const h of r.hs) {
    if (h.del) { for (const k of Object.keys(headers)) if (k.toLowerCase() === h.del) delete headers[k]; continue; }
    headers[h.k] = headers[h.k] ? headers[h.k] + ', ' + h.v : h.v;
  }
  headers['Content-Type'] = TYPES[extname(file)] || 'application/octet-stream';
  headers['Cache-Control'] = headers['Cache-Control'] || 'no-cache';
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(port, () => console.log(`serving ${root} on :${port}`));
