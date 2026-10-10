// Server checks for functions/api/thraasu against an in-memory SQLite shaped like D1.
// run: node 8_thraasu/test-sync.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { handle, pinHash } from '../functions/api/thraasu/[[path]].js';

const raw = new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('./tools/schema.sql', import.meta.url), 'utf8'));
// The D1 surface the function uses: prepare().bind().first/all/run, and batch().
// `queries` counts every statement run, each one inside a batch too: the Free plan allows 50 per invocation.
const db = {
  queries: 0,
  prepare(sql) {
    const st = raw.prepare(sql);
    const bound = (args = []) => ({
      bind: (...a) => bound(a),
      first: async col => { db.queries++; const r = st.get(...args); return r === undefined ? null : col ? r[col] : { ...r }; },
      all: async () => (db.queries++, { results: st.all(...args).map(r => ({ ...r })) }),
      run: async () => (db.queries++, st.run(...args)),
    });
    return bound();
  },
  batch: async stmts => { raw.exec('BEGIN'); try { for (const s of stmts) await s.run(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
const call = async (method, path, { token, body } = {}) => {
  const res = await handle(new Request('https://x.test/api/thraasu/' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), db, path.split('?')[0]);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
};

let n = 0;
const t = async (name, fn) => { await fn(); n++; };
const salt = 'salt-1';
raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created) VALUES (?, ?, ?, ?, ?)').run('NANMA', 'Nanma Store', salt, await pinHash('482913', salt), Date.now());

let token;
await t('login: wrong PIN and unknown code answer alike; the right PIN gets a token', async () => {
  assert.equal((await call('POST', 'login', { body: { code: 'nanma', pin: '000000' } })).status, 401);
  assert.equal((await call('POST', 'login', { body: { code: 'NOPE', pin: '482913' } })).status, 401);
  assert.equal((await call('POST', 'login', { body: { code: 'NANMA', pin: 'abc' } })).status, 401);
  const ok = await call('POST', 'login', { body: { code: ' nanma ', pin: '482913' } });
  assert.equal(ok.status, 200);
  assert.match(ok.data.token, /^[0-9a-f]{64}$/);
  assert.deepEqual(ok.data.shop, { code: 'NANMA', name: 'Nanma Store' });
  token = ok.data.token;
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token = ?').get(token).n, 0, 'raw token must not be stored');
});

await t('every other route needs a session', async () => {
  for (const [m, p] of [['GET', 'state'], ['POST', 'prices'], ['POST', 'sales'], ['PUT', 'photo'], ['GET', 'catalog'], ['PUT', 'shop']]) {
    assert.equal((await call(m, p)).status, 401, p);
    assert.equal((await call(m, p, { token: 'f'.repeat(64) })).status, 401, p + ' with a made-up token');
  }
});

await t('prices: set and clear, junk ignored, state returns them', async () => {
  const r = await call('POST', 'prices', { token, body: { set: { P1: 5900, P2: 8500, 'bad id!': 100, P3: -5, P4: 12.5 }, clear: ['P9'] } });
  assert.equal(r.status, 200);
  await call('POST', 'prices', { token, body: { set: { P2: 9000 }, clear: ['P1'] } });
  const s = await call('GET', 'state', { token });
  assert.deepEqual(s.data.prices, { P2: 9000 });
  assert.deepEqual(s.data.shop, { code: 'NANMA', name: 'Nanma Store' });
  assert.equal(s.data.catalog, null);
});

await t('a big push stays a handful of D1 queries (Free plan: 50 per invocation)', async () => {
  const set = Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['Q' + i, 100 + i]));
  db.queries = 0;
  assert.equal((await call('POST', 'prices', { token, body: { set, clear: Array.from({ length: 60 }, (_, i) => 'Z' + i) } })).status, 200);
  assert.ok(db.queries <= 5, `prices used ${db.queries} queries`);
  const s = await call('GET', 'state', { token });
  assert.equal(Object.keys(s.data.prices).length, 401);
  assert.equal(s.data.prices.Q399, 499);
  db.queries = 0;
  await call('POST', 'prices', { token, body: { set: {}, clear: Object.keys(set) } });
  assert.ok(db.queries <= 5, `clear used ${db.queries} queries`);
  assert.deepEqual((await call('GET', 'state', { token })).data.prices, { P2: 9000 });
});

await t('photos: only data: images within the size cap; fetched in batches by id', async () => {
  const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  assert.equal((await call('PUT', 'photo', { token, body: { id: 'P1', data: jpeg } })).status, 200);
  for (const bad of ['https://evil.test/x.jpg', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,' + 'A'.repeat(300001)])
    assert.equal((await call('PUT', 'photo', { token, body: { id: 'P2', data: bad } })).status, 400, bad.slice(0, 30));
  assert.equal((await call('PUT', 'photo', { token, body: { id: '../x', data: jpeg } })).status, 400);
  const s = await call('GET', 'state', { token });
  assert.deepEqual(Object.keys(s.data.photos), ['P1']);
  const g = await call('GET', 'photos?ids=P1,P2,bad!id', { token });
  assert.deepEqual(Object.keys(g.data), ['P1']);
  assert.equal(g.data.P1.data, jpeg);
});

await t("catalog: 404 until the shop has its own list; parts join back into the list", async () => {
  assert.equal((await call('GET', 'catalog', { token })).status, 404);
  const list = JSON.stringify({ sample: false, categories: [], products: [{ id: 'P1', ml: 'പഞ്ചസാര' }] });
  const half = Math.floor(list.length / 2);
  raw.prepare('INSERT INTO catalog_parts (shop, part, body) VALUES (?, 1, ?), (?, 0, ?)').run('NANMA', list.slice(half), 'NANMA', list.slice(0, half));
  const c = await call('GET', 'catalog', { token });
  assert.equal(c.status, 200);
  assert.equal(c.text, list);
});

await t('sales lower stock; a bill sent again moves it by the difference; a retry moves nothing', async () => {
  raw.prepare("INSERT INTO stock (shop, id, qty) VALUES ('NANMA', 'P1', 25000), ('NANMA', 'P2', 10), ('OTHER', 'P1', 7)").run();
  const sell = sales => call('POST', 'sales', { token, body: { sales } });
  const left = async () => (await call('GET', 'state', { token })).data.stock;
  assert.equal((await sell({ b1: { P1: 1500, P2: 2, P9: 4 }, b2: { P2: 1 } })).status, 200);
  assert.deepEqual(await left(), { P1: 23500, P2: 7 });          // P9 is not counted: no row, no change
  await sell({ b1: { P1: 1500, P2: 2, P9: 4 } });                // the same bill again: a retry
  assert.deepEqual(await left(), { P1: 23500, P2: 7 });
  await sell({ b1: { P1: 500 } });                               // edited after printing: P2 back, P1 by 1000
  assert.deepEqual(await left(), { P1: 24500, P2: 9 });
  await sell({ b2: {}, 'bad id!': { P1: 1 }, b3: { P1: -5, P2: 1.5, 'x y': 1 } });   // emptied; junk ignored
  assert.deepEqual(await left(), { P1: 24500, P2: 10 });
  db.queries = 0;
  await sell(Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['n' + i, { P1: 1, P2: 0 }])));
  assert.ok(db.queries <= 5, `100 bills used ${db.queries} queries`);
  assert.equal((await left()).P1, 24400);
  const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['m' + i, { P1: 1 }]));
  assert.equal((await sell(many)).status, 413);
  assert.equal(raw.prepare("SELECT qty FROM stock WHERE shop = 'OTHER'").get().qty, 7, "another shop's stock is untouched");
});

await t('shop name: trimmed, capped, never empty', async () => {
  assert.equal((await call('PUT', 'shop', { token, body: { name: '   ' } })).status, 400);
  await call('PUT', 'shop', { token, body: { name: '  നന്മ സ്റ്റോർ  ' } });
  assert.equal((await call('GET', 'state', { token })).data.shop.name, 'നന്മ സ്റ്റോർ');
});

await t('one shop never sees another', async () => {
  raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created) VALUES (?, ?, ?, ?, ?)').run('OTHER', 'Other', 's2', await pinHash('1111', 's2'), Date.now());
  const other = (await call('POST', 'login', { body: { code: 'OTHER', pin: '1111' } })).data.token;
  const s = await call('GET', 'state', { token: other });
  assert.deepEqual([s.data.prices, s.data.photos, s.data.stock], [{}, {}, { P1: 7 }]);
  assert.equal((await call('GET', 'catalog', { token: other })).status, 404);
  assert.deepEqual((await call('GET', 'photos?ids=P1', { token: other })).data, {});
});

await t('five wrong PINs lock the code for a while, even for the right PIN', async () => {
  for (let i = 0; i < 5; i++) await call('POST', 'login', { body: { code: 'OTHER', pin: '9999' } });
  assert.equal((await call('POST', 'login', { body: { code: 'OTHER', pin: '1111' } })).status, 429);
  raw.prepare("UPDATE shops SET locked_until = 0 WHERE code = 'OTHER'").run();
  assert.equal((await call('POST', 'login', { body: { code: 'OTHER', pin: '1111' } })).status, 200);
});

await t('logout ends the session', async () => {
  assert.equal((await call('POST', 'logout', { token })).status, 200);
  assert.equal((await call('GET', 'state', { token })).status, 401);
});

await t('unknown routes are a JSON 404', async () => {
  const fresh = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  assert.equal((await call('DELETE', 'state', { token: fresh })).status, 404);
});

console.log(`OK: ${n} checks passed (thraasu sync server)`);
