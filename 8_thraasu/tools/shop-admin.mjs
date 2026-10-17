// Thraasu shop accounts, run from the repo root against the live D1 database (wrangler logged in).
//   node 8_thraasu/tools/shop-admin.mjs add CODE "Shop name" [PIN]   new shop; prints the PIN once
//   node 8_thraasu/tools/shop-admin.mjs pin CODE [PIN]               new PIN, ends every session
//   node 8_thraasu/tools/shop-admin.mjs catalog CODE list.json       the shop's own product list
//   node 8_thraasu/tools/shop-admin.mjs stock CODE list.json         counts from the list's stock fields (a stocktake: replaces all)
//   node 8_thraasu/tools/shop-admin.mjs remove CODE                  the shop and all its data
//   node 8_thraasu/tools/shop-admin.mjs list
//   node 8_thraasu/tools/shop-admin.mjs requests                     shops asked for in the app, waiting
//   node 8_thraasu/tools/shop-admin.mjs approve CODE                 let a requested shop log in
//   node 8_thraasu/tools/shop-admin.mjs reject CODE                  delete a request
// A PIN given on the command line lands in shell history; leave it out to get a random one.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { pinHash } from '../../functions/api/thraasu/[[path]].js';

const [cmd, rawCode, arg, arg2] = process.argv.slice(2);
const code = (rawCode || '').toUpperCase();
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const die = m => { console.error(m); process.exit(1); };
const d1 = sql => {
  const dir = mkdtempSync(join(tmpdir(), 'thraasu-')), file = join(dir, 'run.sql');
  writeFileSync(file, sql);
  try {
    return execFileSync('npx', ['-y', 'wrangler@4', 'd1', 'execute', 'thraasu', '--remote', '--json', '--file', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
// Reads go through --command: with --file, wrangler prints upload progress into the --json output.
const d1read = sql => JSON.parse(execFileSync('npx', ['-y', 'wrangler@4', 'd1', 'execute', 'thraasu', '--remote', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))[0].results;
const newPin = p => { const pin = p || String(randomInt(100000, 1000000)); if (!/^\d{4,8}$/.test(pin)) die('PIN: 4 to 8 digits'); return pin; };
const needCode = () => /^[A-Z0-9-]{2,20}$/.test(code) || die('CODE: 2-20 of A-Z 0-9 -');

if (cmd === 'add') {
  needCode(); if (!arg) die('name required');
  const pin = newPin(arg2), salt = randomBytes(16).toString('hex');
  d1(`INSERT INTO shops (code, name, salt, pin_hash, created) VALUES (${q(code)}, ${q(arg)}, ${q(salt)}, ${q(await pinHash(pin, salt))}, ${Date.now()});`);
  console.log(`added ${code} "${arg}"  PIN ${pin}  (give it to the shop; it is not stored anywhere readable)`);
} else if (cmd === 'pin') {
  needCode();
  const pin = newPin(arg), salt = randomBytes(16).toString('hex');
  d1(`UPDATE shops SET salt = ${q(salt)}, pin_hash = ${q(await pinHash(pin, salt))}, failed = 0, locked_until = 0 WHERE code = ${q(code)};
DELETE FROM sessions WHERE shop = ${q(code)};`);
  console.log(`${code} PIN ${pin}; every phone logged in to it must log in again`);
} else if (cmd === 'catalog') {
  needCode(); if (!arg) die('list.json required');
  const text = readFileSync(arg, 'utf8');
  const list = JSON.parse(text);
  if (!Array.isArray(list.products) || !Array.isArray(list.categories)) die('not a products list');
  // D1 caps one statement at 100 KB; 12,000 characters stays under it even when all are Malayalam (3 bytes each).
  const parts = [];
  for (let i = 0; i < text.length; i += 12000) parts.push(text.slice(i, i + 12000));
  d1([`DELETE FROM catalog_parts WHERE shop = ${q(code)};`,
    ...parts.map((p, i) => `INSERT INTO catalog_parts (shop, part, body) VALUES (${q(code)}, ${i}, ${q(p)});`),
    `UPDATE shops SET catalog_at = ${Date.now()} WHERE code = ${q(code)};`].join('\n'));
  console.log(`${code}: ${list.products.length} products in ${parts.length} parts`);
} else if (cmd === 'stock') {
  needCode(); if (!arg) die('list.json required');
  const counted = (JSON.parse(readFileSync(arg, 'utf8')).products || []).filter(p => /^[\w-]{1,40}$/.test(p.id) && Number.isInteger(p.stock));
  if (!counted.length) die('no stock fields in that list');
  d1([`DELETE FROM stock WHERE shop = ${q(code)};`,
    ...counted.map(p => `INSERT INTO stock (shop, id, qty) VALUES (${q(code)}, ${q(p.id)}, ${p.stock});`)].join('\n'));
  console.log(`${code}: stock set for ${counted.length} products; bills lower it from here`);
} else if (cmd === 'remove') {
  needCode();
  d1(['shops WHERE code', 'sessions WHERE shop', 'prices WHERE shop', 'photos WHERE shop', 'catalog_parts WHERE shop', 'stock WHERE shop', 'sales WHERE shop', 'items WHERE shop', 'hidden WHERE shop']
    .map(w => `DELETE FROM ${w} = ${q(code)};`).join('\n'));
  console.log(`${code} removed with its prices, photos, list, added and removed items, stock, sales and sessions`);
} else if (cmd === 'requests') {
  const rows = d1read("SELECT code, name, mobile, datetime(created / 1000, 'unixepoch', '+330 minutes') AS asked_ist FROM shops WHERE status = 'pending' ORDER BY created");
  rows.length ? console.table(rows) : console.log('no requests waiting');
} else if (cmd === 'approve' || cmd === 'reject') {
  needCode();
  const [shop] = d1read(`SELECT status FROM shops WHERE code = ${q(code)}`);
  if (shop?.status !== 'pending') die(`${code} is not a waiting request`);
  d1(cmd === 'approve' ? `UPDATE shops SET status = 'active' WHERE code = ${q(code)};` : `DELETE FROM shops WHERE code = ${q(code)} AND status = 'pending';`);
  console.log(cmd === 'approve' ? `${code} approved: it can log in now` : `${code} request deleted`);
} else if (cmd === 'list') {
  console.table(d1read(`SELECT s.code, s.name, s.status, s.mobile, (SELECT COUNT(*) FROM prices p WHERE p.shop = s.code) AS prices, (SELECT COUNT(*) FROM photos f WHERE f.shop = s.code) AS photos, (SELECT COUNT(*) FROM stock k WHERE k.shop = s.code) AS counted, (SELECT COUNT(*) FROM sales b WHERE b.shop = s.code) AS bills, (SELECT COUNT(*) FROM items i WHERE i.shop = s.code) AS added, s.catalog_at IS NOT NULL AS own_list FROM shops s ORDER BY s.code`));
} else die(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
