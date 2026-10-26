// Server checks for functions/api/thraasu against an in-memory SQLite shaped like D1.
// run: node 8_thraasu/test-sync.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { handle, pinHash, paidThrough, endOfDay, TRIAL_DAYS } from '../functions/api/thraasu/[[path]].js';
import { mime } from '../workers/thraasu-mail/mime.js';

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
      run: async () => { db.queries++; return { meta: { changes: Number(st.run(...args).changes) } }; },
    });
    return bound();
  },
  batch: async stmts => { raw.exec('BEGIN'); try { for (const s of stmts) await s.run(); raw.exec('COMMIT'); } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
const call = async (method, path, { token, body } = {}) => {
  const res = await handle(new Request('https://x.test/api/thraasu/' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  }), db, path.split('?')[0], { send: m => mails.push(m), reviewKey: 'test-review-key' });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
};

let n = 0;
const t = async (name, fn) => { await fn(); n++; };
const salt = 'salt-1';
raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created, paid_until) VALUES (?, ?, ?, ?, ?, ?)').run('NANMA', 'Nanma Store', salt, await pinHash('482913', salt), Date.now(), Date.now() + 365 * 864e5);

let token, signupCode;
const mails = [];
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
  for (const [m, p] of [['GET', 'state'], ['POST', 'prices'], ['POST', 'sales'], ['PUT', 'photo'], ['GET', 'catalog'], ['PUT', 'shop'], ['POST', 'items'], ['GET', 'items'], ['POST', 'bills'], ['GET', 'bills']]) {
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
  raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created, paid_until) VALUES (?, ?, ?, ?, ?, ?)').run('OTHER', 'Other', 's2', await pinHash('1111', 's2'), Date.now(), Date.now() + 365 * 864e5);
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

await t('sign-up: checked, pending with a readable code, one request per mobile', async () => {
  const su = body => call('POST', 'signup', { body });
  for (const bad of [{ name: ' ', mobile: '9847012345', pin: '1234' }, { name: 'A', mobile: '12345', pin: '1234' },
    { name: 'A', mobile: '5847012345', pin: '1234' }, { name: 'A', mobile: '9847012345', pin: '123' }, { name: 'A', mobile: '9847012345', pin: 'abcd' }, 'junk'])
    assert.equal((await su(bad)).status, 400, JSON.stringify(bad));
  const r = await su({ name: '  Raju   Stores ', mobile: '+91 98470-12345', pin: '2468' });
  assert.equal(r.status, 200);
  assert.match(r.data.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const row = raw.prepare('SELECT name, mobile, status FROM shops WHERE code = ?').get(r.data.code);
  assert.deepEqual({ ...row }, { name: 'Raju Stores', mobile: '9847012345', status: 'pending' });
  assert.equal((await su({ name: 'Again', mobile: '09847012345', pin: '1357' })).status, 409);
  assert.equal(mails.length, 1, 'one email, for the request that was made');
  assert.equal(mails[0].subject, `New Thraasu shop request: Raju Stores (${r.data.code})`);
  assert.match(mails[0].text, /Owner mobile: 9847012345/);
  const link = mails[0].text.match(/Approve or reject: (\S+)/)[1];
  assert.ok(link.startsWith(`https://x.test/api/thraasu/review?code=${r.data.code}&sig=`), link);
  assert.ok(mails[0].html.includes('>Review and approve</a>'));
  signupCode = r.data.code;
});

await t('a pending shop cannot log in: wrong PIN as ever, right PIN says pending; approved, it can', async () => {
  assert.equal((await call('POST', 'login', { body: { code: signupCode, pin: '1111' } })).status, 401);
  const p = await call('POST', 'login', { body: { code: signupCode, pin: '2468' } });
  assert.deepEqual([p.status, p.data], [403, { error: 'pending' }]);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM sessions WHERE shop = ?').get(signupCode).n, 0);
  raw.prepare("UPDATE shops SET status = 'active' WHERE code = ?").run(signupCode);
  assert.equal((await call('POST', 'login', { body: { code: signupCode, pin: '2468' } })).status, 200);
  assert.equal((await call('POST', 'signup', { body: { name: 'Second shop', mobile: '9847012345', pin: '1357' } })).status, 200, 'approved: the same owner may ask again');
});

await t('review link: GET shows the request; POST approves or rejects; a bad or reused link changes nothing', async () => {
  const path = l => l.split('/api/thraasu/')[1];
  const mailed = mails.at(-1), code = mailed.subject.match(/\((\w+)\)$/)[1], link = path(mailed.text.match(/Approve or reject: (\S+)/)[1]);
  assert.equal(raw.prepare('SELECT status FROM shops WHERE code = ?').get(code).status, 'pending');
  for (const bad of [link.replace(/sig=(\w)/, (_, c) => 'sig=' + (c === '0' ? '1' : '0')), link.replace(/sig=\w+/, 'sig='), link.replace(code, 'NANMA'), 'review?code=NANMA'])
    assert.equal((await call('POST', bad, { body: 'do=approve' })).status, 403, bad);
  const g = await call('GET', link);
  assert.equal(g.status, 200);
  assert.ok(g.text.includes('Second shop') && g.text.includes('value="approve"') && g.text.includes('tel:+919847012345'));
  assert.equal(raw.prepare('SELECT status FROM shops WHERE code = ?').get(code).status, 'pending', 'opening the link approves nothing');
  const before = Date.now();
  const a = await call('POST', link, { body: 'do=approve' });
  assert.ok(a.text.includes('Approved: the shop can log in now.'));
  assert.equal(raw.prepare('SELECT status FROM shops WHERE code = ?').get(code).status, 'active');
  const trial = raw.prepare('SELECT paid_until FROM shops WHERE code = ?').get(code).paid_until;
  assert.ok([paidThrough(0, TRIAL_DAYS, before), paidThrough(0, TRIAL_DAYS)].includes(trial), 'approving starts the 30-day trial');
  await call('POST', link, { body: 'do=reject' });
  assert.equal(raw.prepare('SELECT status FROM shops WHERE code = ?').get(code).status, 'active', 'an approved shop is never rejected by its link');
  // a hostile name is shown as text; reject deletes the request
  const x = await call('POST', 'signup', { body: { name: '<img src=x onerror=alert(1)>', mobile: '9811111111', pin: '1234' } });
  const xl = path(mails.at(-1).text.match(/Approve or reject: (\S+)/)[1]);
  assert.ok(!(await call('GET', xl)).text.includes('<img') && mails.at(-1).html.includes('&lt;img'));
  assert.ok((await call('POST', xl, { body: 'do=reject' })).text.includes('Rejected'));
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM shops WHERE code = ?').get(x.data.code).n, 0);
  assert.ok((await call('GET', xl)).text.includes('This request no longer exists'));
  const h = (await handle(new Request('https://x.test/api/thraasu/' + xl), db, 'review', { reviewKey: 'test-review-key' })).headers;
  assert.match(h.get('content-security-policy'), /default-src 'none'/);
  assert.equal(h.get('referrer-policy'), 'no-referrer');
});

await t('the mailer writes UTF-8 MIME: encoded subject, text and HTML parts', async () => {
  const m = mime({ from: 'alerts@tinkerhouse.uk', to: 'a@b.c', subject: 'നന്മ (K7M3QX)', text: 'കട: നന്മ', html: '<p>കട</p>' });
  const dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\r\n/g, '')), c => c.charCodeAt(0)));
  assert.equal(dec(m.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)[1]), 'നന്മ (K7M3QX)');
  const parts = m.split(/--b[0-9a-f-]+/).slice(1, 3).map(p => [p.match(/Content-Type: (\S+);/)[1], dec(p.split('\r\n\r\n')[1])]);
  assert.deepEqual(parts, [['text/plain', 'കട: നന്മ'], ['text/html', '<p>കട</p>']]);
  assert.ok(m.split('\r\n').every(l => l.length <= 998), 'no line over the SMTP limit');
});

await t('at most 20 requests wait at once', async () => {
  const waiting = raw.prepare("SELECT COUNT(*) AS n FROM shops WHERE status = 'pending'").get().n;
  for (let i = waiting; i < 20; i++) raw.prepare("INSERT INTO shops (code, name, salt, pin_hash, created, status, mobile) VALUES (?, 'x', 's', 'h', 0, 'pending', ?)").run('W' + i, String(9000000000 + i));
  assert.equal((await call('POST', 'signup', { body: { name: 'Late', mobile: '9123456789', pin: '1234' } })).status, 429);
});

await t("photos: 25 MB a shop; replacing one fits in its own room", async () => {
  const fresh = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  raw.prepare("DELETE FROM photos WHERE shop = 'NANMA'").run();
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(299000);
  let ok = 0;
  for (let i = 0; i < 90; i++) if ((await call('PUT', 'photo', { token: fresh, body: { id: 'B' + i, data: big } })).status === 200) ok++; else break;
  assert.equal(ok, Math.floor(25e6 / big.length));
  assert.equal((await call('PUT', 'photo', { token: fresh, body: { id: 'B0', data: big } })).status, 200);
  raw.prepare("DELETE FROM photos WHERE shop = 'NANMA'").run();
});

await t('sold bills older than 60 days are dropped; stock is not touched', async () => {
  const fresh = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  raw.prepare("INSERT INTO sales (shop, bill, items, at) VALUES ('NANMA', 'old', '{\"P1\":5}', ?), ('OTHER', 'old', '{}', 0)").run(Date.now() - 61 * 864e5);
  const before = raw.prepare("SELECT qty FROM stock WHERE shop = 'NANMA' AND id = 'P1'").get().qty;
  await call('POST', 'sales', { token: fresh, body: { sales: { fresh1: { P1: 1 } } } });
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sales WHERE shop = 'NANMA' AND bill = 'old'").get().n, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sales WHERE shop = 'OTHER'").get().n, 1, "another shop's are its own business");
  assert.equal(raw.prepare("SELECT qty FROM stock WHERE shop = 'NANMA' AND id = 'P1'").get().qty, before - 1);
});

await t('items: added on a phone, one per name; drop takes its price and photo along', async () => {
  const token = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  const it = (ml, key, extra = {}) => ({ cat: 'veg', ml, en: '', unit: 'pc', rate: 50, icon: '🍪', key, ...extra });
  let r = await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50'), 'bad id!': it('x', 'x'), uB2: it('', 'y') }, drop: [] } });
  assert.equal(r.status, 200); assert.deepEqual(r.data.dup, []);
  let s = await call('GET', 'state', { token });
  assert.ok(s.data.items > 0, 'state names when items last changed');
  const was = s.data.items;
  await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50') } } });
  await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50') } } });
  assert.ok((await call('GET', 'state', { token })).data.items >= was + 2, 'items_at moves on every change, even within a millisecond');
  assert.deepEqual((await call('GET', 'items', { token })).data, { uA1: { cat: 'veg', ml: 'മിൽക്കിബാർ 50', en: '', unit: 'pc', rate: 50, icon: '🍪' } });
  r = await call('POST', 'items', { token, body: { set: { uC3: it('Milkybar 50', 'milkybar50') } } });   // another phone, same name
  assert.deepEqual(r.data.dup, ['uC3']);
  r = await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50', { rate: 55 }) } } });   // its own price change
  assert.deepEqual(r.data.dup, []);
  assert.equal((await call('GET', 'items', { token })).data.uA1.rate, 55);
  await call('POST', 'prices', { token, body: { set: { uA1: 6000 } } });
  await call('PUT', 'photo', { token, body: { id: 'uA1', data: 'data:image/jpeg;base64,/9j/AAAA' } });
  db.queries = 0;
  r = await call('POST', 'items', { token, body: { drop: ['uA1'], set: { uD4: it('Milkybar 50', 'milkybar50') } } });   // dropped: its name is free again
  assert.ok(db.queries <= 8, `items used ${db.queries} queries`);
  assert.deepEqual(r.data.dup, []);
  assert.deepEqual(Object.keys((await call('GET', 'items', { token })).data), ['uD4']);
  s = await call('GET', 'state', { token });
  assert.equal(s.data.prices.uA1, undefined); assert.equal(s.data.photos.uA1, undefined);
  const many = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['uM' + i, it('m' + i, 'm' + i)]));
  assert.equal((await call('POST', 'items', { token, body: { set: many } })).status, 413);
  assert.deepEqual(Object.keys((await call('GET', 'items', { token })).data), ['uD4']);
});

await t('hidden: items a shop took off its list reach every phone; junk ignored; capped; per shop', async () => {
  const token = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  assert.deepEqual((await call('GET', 'state', { token })).data.hidden, []);
  assert.equal((await call('POST', 'hidden', { token, body: { hide: ['tomato', 'onion', 'bad id!', 7], show: [] } })).status, 200);
  await call('POST', 'hidden', { token, body: { hide: ['tomato'], show: ['onion', 'never'] } });   // again, and one back
  assert.deepEqual((await call('GET', 'state', { token })).data.hidden, ['tomato']);
  const other = (await call('POST', 'login', { body: { code: 'OTHER', pin: '1111' } })).data.token;
  assert.deepEqual((await call('GET', 'state', { token: other })).data.hidden, [], "another shop's list is its own");
  const many = Array.from({ length: 2000 }, (_, i) => 'h' + i);
  assert.equal((await call('POST', 'hidden', { token, body: { hide: many } })).status, 413);
  assert.deepEqual((await call('GET', 'state', { token })).data.hidden, ['tomato']);
  assert.equal((await call('POST', 'hidden', { body: { hide: ['x'] } })).status, 401);
});

await t('bills: every phone of the shop gets them, only what changed since; junk refused; old ones go; per shop', async () => {
  const login = async code => (await call('POST', 'login', { body: code === 'OTHER' ? { code, pin: '1111' } : { code, pin: '482913' } })).data.token;
  const a = await login('NANMA'), b = await login('NANMA');
  const now = new Date().toISOString(), old = new Date(Date.now() - 4 * 864e5).toISOString();
  const bill = (id, no, pay, lines = [{ ml: 'തക്കാളി', qty: 500, unit: 'kg', rate: 4000, sample: false }]) => ({ id, no, started: now, discount: 0, pay, lines });
  const send = (token, bills) => call('POST', 'bills', { token, body: { bills } });
  const pull = async (token, since = 0) => (await call('GET', 'bills?since=' + since, { token })).data;
  const state = async token => (await call('GET', 'state', { token })).data.bills;
  assert.equal(await state(b), null);                                            // nothing sold yet
  assert.equal((await send(a, { k1: bill('k1', 1, 'cash'), k2: bill('k2', 2, 'upi') })).status, 200);
  const first = await pull(b);
  assert.deepEqual(first.bills.map(x => [x.id, x.bill.no, x.bill.pay]), [['k1', 1, 'cash'], ['k2', 2, 'upi']]);
  assert.equal(await state(b), first.at, 'state names the counter GET bills answered with');
  await send(b, { k1: bill('k1', 1, 'credit') });                                 // the payment changed on another phone
  const next = await pull(a, first.at);
  assert.deepEqual(next.bills.map(x => [x.id, x.bill.pay]), [['k1', 'credit']], 'only what changed since');
  await send(a, { k2: bill('k2', 2, 'upi', []) });                                // every line taken off
  assert.deepEqual((await pull(b, next.at)).bills.map(x => [x.id, x.bill.lines.length]), [['k2', 0]]);
  const realNow = Date.now, t0 = realNow();                                       // two writes in one millisecond still move it
  Date.now = () => t0;
  try {
    await send(a, { k1: bill('k1', 1, 'cash') });
    const s1 = await state(a);
    await send(a, { k1: bill('k1', 1, 'upi') });
    assert.ok(await state(a) > s1, 'bills_at moves on every write');
  } finally { Date.now = realNow; }
  await send(a, { 'bad id!': bill('bad id!', 3, 'cash'), k3: bill('k4', 3, 'cash'), k5: { ...bill('k5', 5, 'card'), sold: true }, k6: { ...bill('k6', 6, 'cash'), started: old } });
  const got = Object.fromEntries((await pull(b)).bills.map(x => [x.id, x.bill]));
  assert.deepEqual(Object.keys(got).sort(), ['k1', 'k2', 'k5'], 'a bad id, a body for another id and a bill over 3 days old are refused');
  assert.deepEqual([got.k5.pay, 'sold' in got.k5], [null, false]);
  const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => ['m' + i, bill('m' + i, i + 1, 'cash')]));
  assert.equal((await send(a, many)).status, 413);
  delete many.m50; db.queries = 0;
  assert.equal((await send(a, many)).status, 200);
  assert.ok(db.queries <= 5, `50 bills used ${db.queries} queries`);
  raw.prepare("INSERT INTO bills (shop, id, body, started, at) VALUES ('NANMA', 'stale', '{}', ?, 1)").run(Date.now() - 4 * 864e5);
  assert.ok(!(await pull(b)).bills.some(x => x.id === 'stale'), 'never handed out');
  await send(a, { k1: bill('k1', 1, 'cash') });
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM bills WHERE id = 'stale'").get().n, 0, 'deleted on the next write');
  assert.deepEqual((await pull(await login('OTHER'))).bills, [], "another shop's bills are its own");
});

await t('paidThrough: 30 days after the approval day; a renewal runs from the end, or from tomorrow after a lapse', async () => {
  const ist = s => Date.parse(s + '+05:30');
  assert.equal(paidThrough(0, TRIAL_DAYS, ist('2026-10-24T13:00:00')), ist('2026-11-24T00:00:00'), 'last day 23 Nov');
  const end = ist('2026-11-24T00:00:00');
  assert.equal(paidThrough(end, 30, ist('2026-11-20T10:00:00')), ist('2026-12-24T00:00:00'), 'before the end: from the end');
  assert.equal(paidThrough(end, 30, ist('2026-11-26T09:00:00')), ist('2026-12-27T00:00:00'), 'after a lapse: from tomorrow');
  assert.equal(endOfDay('2027-03-31'), ist('2027-04-01T00:00:00'));
  for (const bad of ['2027-02-30', '2027-3-31', 'soon', '']) assert.equal(endOfDay(bad), null, bad);
});

await t('past its date a shop is paused: 402 with the date on every route but logout; login still works', async () => {
  const fresh = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  const paid = raw.prepare("SELECT paid_until FROM shops WHERE code = 'NANMA'").get().paid_until;
  assert.equal((await call('GET', 'state', { token: fresh })).data.paid, paid, 'state carries the date');
  raw.prepare("UPDATE shops SET paid_until = ? WHERE code = 'NANMA'").run(Date.now() - 1000);
  try {
    for (const [m, p] of [['GET', 'state'], ['POST', 'prices'], ['POST', 'sales'], ['PUT', 'photo'], ['GET', 'catalog'], ['PUT', 'shop'], ['POST', 'items'], ['GET', 'items'], ['POST', 'bills'], ['GET', 'bills'], ['POST', 'hidden'], ['GET', 'photos']]) {
      const r = await call(m, p, { token: fresh, body: m === 'GET' ? undefined : {} });
      assert.deepEqual([r.status, r.data.error, typeof r.data.until], [402, 'paused', 'number'], p);
    }
    db.queries = 0;
    assert.equal((await call('GET', 'state', { token: fresh })).status, 402);
    assert.equal(db.queries, 1, 'the check rides on the session lookup');
    const again = await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } });
    assert.equal(again.status, 200, 'a paused shop still logs in, so its phone can say why');
    assert.equal((await call('POST', 'logout', { token: again.data.token })).status, 200, 'and can log out');
    raw.prepare("UPDATE shops SET paid_until = ? WHERE code = 'NANMA'").run(paidThrough(Date.now() - 1000, 30));
    assert.equal((await call('GET', 'state', { token: fresh })).status, 200, 'renewed: the same session works again');
  } finally { raw.prepare("UPDATE shops SET paid_until = ? WHERE code = 'NANMA'").run(paid); }
});

await t('unknown routes are a JSON 404', async () => {
  const fresh = (await call('POST', 'login', { body: { code: 'NANMA', pin: '482913' } })).data.token;
  assert.equal((await call('DELETE', 'state', { token: fresh })).status, 404);
});

console.log(`OK: ${n} checks passed (thraasu sync server)`);
