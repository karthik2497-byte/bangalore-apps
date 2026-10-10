// Thraasu shop sync. One Pages Function on the app's own origin (so the app's CSP
// `connect-src 'self'` covers it) over one D1 database bound as THRAASU_DB; schema in
// 8_thraasu/tools/schema.sql. A shop is requested from the app (POST signup) and starts pending;
// 8_thraasu/tools/shop-admin.mjs approves it (or makes one directly). A shop's list, its prices and its photos are kept per shop; the
// app works offline and pushes when it can. Last write wins per item. Bills lower the shop's
// stock (POST sales). On the Free plan an invocation gets 50 D1 queries, so no route's query
// count grows with its input: lists go in as one JSON parameter through json_each.
// Pages does not apply _headers to Functions: every response sets its own headers.

const PBKDF2_ITER = 20000;   // ponytail: a 4-8 digit PIN falls to offline guessing at any cost; the lockout is the guard
const LOCK_AFTER = 5, LOCK_MS = 15 * 60e3, SESSION_MS = 365 * 864e5;
const MAX_PHOTO = 300000, MAX_PHOTOS = 3000, MAX_PRICES = 5000, IDS_PER_GET = 30, BILLS_PER_POST = 100;
// D1 Free holds 500 MB per database: a shop's photos are capped in bytes, and sold bills are kept
// only as long as a phone might send one again.
const PHOTO_BYTES = 25e6, SALES_KEEP_MS = 60 * 864e5, PENDING_MAX = 20;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32: no 0/O or 1/I to misread over the phone
const ID = /^[\w-]{1,40}$/, PHOTO = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const sameText = (a, b) => a.length === b.length && [...a].reduce((d, c, i) => d | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;
const readJson = async request => { try { return await request.json(); } catch { return null; } };

export async function pinHash(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}

// Sessions are stored as the SHA-256 of the token, so a copy of the database holds no live login.
async function sessionShop(request, db) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const row = await db.prepare('SELECT shop, created FROM sessions WHERE token = ?').bind(await sha256(m[1])).first();
  return row && Date.now() - row.created < SESSION_MS ? row.shop : null;
}

async function login(request, db) {
  const b = await readJson(request);
  const code = String(b?.code ?? '').trim().toUpperCase(), pin = String(b?.pin ?? '');
  const shop = /^[A-Z0-9-]{2,20}$/.test(code) && /^\d{4,8}$/.test(pin)
    ? await db.prepare('SELECT * FROM shops WHERE code = ?').bind(code).first() : null;
  if (shop && shop.locked_until > Date.now()) return json({ error: 'locked' }, 429);
  if (!shop || !sameText(await pinHash(pin, shop.salt), shop.pin_hash)) {
    if (shop) {
      const n = shop.failed + 1, lock = n >= LOCK_AFTER;
      await db.prepare('UPDATE shops SET failed = ?, locked_until = ? WHERE code = ?').bind(lock ? 0 : n, lock ? Date.now() + LOCK_MS : 0, code).run();
    }
    return json({ error: 'wrong' }, 401);        // unknown code and wrong PIN look the same
  }
  if (shop.status === 'pending') return json({ error: 'pending' }, 403);   // only once the PIN is right
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare('UPDATE shops SET failed = 0, locked_until = 0 WHERE code = ?').bind(code),
    db.prepare('INSERT INTO sessions (token, shop, created) VALUES (?, ?, ?)').bind(await sha256(token), code, Date.now()),
  ]);
  return json({ token, shop: { code, name: shop.name } });
}

// A request for a new shop. It cannot log in until approved with shop-admin.mjs approve.
async function signup(request, db) {
  const b = await readJson(request);
  const name = String(b?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const mobile = String(b?.mobile ?? '').replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
  const pin = String(b?.pin ?? '');
  if (!name || !/^[6-9]\d{9}$/.test(mobile) || !/^\d{4,8}$/.test(pin)) return json({ error: 'bad' }, 400);
  const waiting = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(mobile = ?), 0) AS same FROM shops WHERE status = 'pending'").bind(mobile).first();
  if (waiting.same) return json({ error: 'already' }, 409);
  if (waiting.n >= PENDING_MAX) return json({ error: 'full' }, 429);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))), hash = await pinHash(pin, salt);
  for (let i = 0; i < 5; i++) {
    const code = [...crypto.getRandomValues(new Uint8Array(6))].map(x => CODE_CHARS[x % 32]).join('');
    const r = await db.prepare("INSERT INTO shops (code, name, salt, pin_hash, created, status, mobile) VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT (code) DO NOTHING")
      .bind(code, name, salt, hash, Date.now(), mobile).run();
    if (r.meta.changes) return json({ code });
  }
  return json({ error: 'server' }, 500);
}

export async function handle(request, db, path) {
  if (request.method === 'POST' && path === 'login') return login(request, db);
  if (request.method === 'POST' && path === 'signup') return signup(request, db);
  const shop = await sessionShop(request, db);
  if (!shop) return json({ error: 'login' }, 401);
  const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE shop = ?`).bind(shop).first('n');

  switch (request.method + ' ' + path) {
    case 'POST logout': {
      const token = request.headers.get('authorization').slice(7);
      await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
      return json({ ok: true });
    }
    case 'GET state': {
      const s = await db.prepare('SELECT name, catalog_at FROM shops WHERE code = ?').bind(shop).first();
      const prices = await db.prepare('SELECT id, paise FROM prices WHERE shop = ?').bind(shop).all();
      const photos = await db.prepare('SELECT id, at FROM photos WHERE shop = ?').bind(shop).all();
      const stock = await db.prepare('SELECT id, qty FROM stock WHERE shop = ?').bind(shop).all();
      return json({
        shop: { code: shop, name: s.name }, catalog: s.catalog_at ?? null,
        prices: Object.fromEntries(prices.results.map(r => [r.id, r.paise])),
        photos: Object.fromEntries(photos.results.map(r => [r.id, r.at])),
        stock: Object.fromEntries(stock.results.map(r => [r.id, r.qty])),
      });
    }
    case 'POST prices': {
      const b = await readJson(request);
      const set = Object.entries(b?.set && typeof b.set === 'object' ? b.set : {}).filter(([id, v]) => ID.test(id) && Number.isInteger(v) && v > 0 && v < 1e9);
      const clear = (Array.isArray(b?.clear) ? b.clear : []).filter(id => typeof id === 'string' && ID.test(id));
      if (set.length + clear.length > MAX_PRICES || await count('prices') + set.length > MAX_PRICES) return json({ error: 'too many' }, 413);
      const at = Date.now();
      if (set.length + clear.length) await db.batch([
        db.prepare('INSERT INTO prices (shop, id, paise, at) SELECT ?, key, value, ? FROM json_each(?) WHERE true ON CONFLICT (shop, id) DO UPDATE SET paise = excluded.paise, at = excluded.at')
          .bind(shop, at, JSON.stringify(Object.fromEntries(set))),
        db.prepare('DELETE FROM prices WHERE shop = ? AND id IN (SELECT value FROM json_each(?))').bind(shop, JSON.stringify(clear)),
      ]);
      return json({ ok: true, at });
    }
    case 'POST sales': {
      // {sales: {billId: {productId: qty}}}. A bill replaces what was sent for it before, so stock
      // moves by the difference: an edit after printing corrects it, a retry changes nothing.
      const b = await readJson(request);
      const sales = Object.entries(b?.sales && typeof b.sales === 'object' ? b.sales : {}).filter(([k]) => ID.test(k))
        .map(([k, items]) => [k, Object.fromEntries(Object.entries(items && typeof items === 'object' ? items : {})
          .filter(([id, q]) => ID.test(id) && Number.isInteger(q) && q > 0 && q < 1e9))]);
      if (sales.length > BILLS_PER_POST) return json({ error: 'too many' }, 413);
      if (!sales.length) return json({ ok: true });
      const was = await db.prepare('SELECT items FROM sales WHERE shop = ? AND bill IN (SELECT value FROM json_each(?))')
        .bind(shop, JSON.stringify(sales.map(([k]) => k))).all();
      const delta = {};
      const add = (items, sign) => { for (const [id, q] of Object.entries(items)) delta[id] = (delta[id] || 0) + sign * q; };
      for (const r of was.results) add(JSON.parse(r.items), -1);
      for (const [, items] of sales) add(items, 1);
      // ponytail: read, then write; safe because a bill id belongs to one phone, which syncs one request at a time
      const now = Date.now();
      await db.batch([
        db.prepare('DELETE FROM sales WHERE shop = ? AND at < ?').bind(shop, now - SALES_KEEP_MS),
        db.prepare('INSERT INTO sales (shop, bill, items, at) SELECT ?, key, value, ? FROM json_each(?) WHERE true ON CONFLICT (shop, bill) DO UPDATE SET items = excluded.items, at = excluded.at')
          .bind(shop, now, JSON.stringify(Object.fromEntries(sales))),
        db.prepare('UPDATE stock SET qty = qty - d.value FROM json_each(?) AS d WHERE stock.shop = ? AND stock.id = d.key')
          .bind(JSON.stringify(delta), shop),
      ]);
      return json({ ok: true });
    }
    case 'PUT photo': {
      const b = await readJson(request);
      if (!ID.test(b?.id ?? '') || typeof b.data !== 'string' || b.data.length > MAX_PHOTO || !PHOTO.test(b.data)) return json({ error: 'bad photo' }, 400);
      const held = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(length(data)), 0) AS bytes FROM photos WHERE shop = ? AND id != ?').bind(shop, b.id).first();
      if (held.n >= MAX_PHOTOS || held.bytes + b.data.length > PHOTO_BYTES) return json({ error: 'too many' }, 413);
      const at = Date.now();
      await db.prepare('INSERT INTO photos (shop, id, data, at) VALUES (?, ?, ?, ?) ON CONFLICT (shop, id) DO UPDATE SET data = excluded.data, at = excluded.at').bind(shop, b.id, b.data, at).run();
      return json({ ok: true, at });
    }
    case 'GET photos': {
      const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').filter(id => ID.test(id)).slice(0, IDS_PER_GET);
      if (!ids.length) return json({});
      const r = await db.prepare(`SELECT id, data, at FROM photos WHERE shop = ? AND id IN (${ids.map(() => '?').join(',')})`).bind(shop, ...ids).all();
      return json(Object.fromEntries(r.results.map(x => [x.id, { data: x.data, at: x.at }])));
    }
    case 'GET catalog': {
      // Stored in parts: a D1 statement is capped at 100 KB and a shop's list is larger.
      const r = await db.prepare('SELECT body FROM catalog_parts WHERE shop = ? ORDER BY part').bind(shop).all();
      if (!r.results.length) return json({ error: 'none' }, 404);
      return new Response(r.results.map(x => x.body).join(''), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    case 'PUT shop': {
      const name = String((await readJson(request))?.name ?? '').trim().slice(0, 60);
      if (!name) return json({ error: 'name' }, 400);
      await db.prepare('UPDATE shops SET name = ? WHERE code = ?').bind(name, shop).run();
      return json({ ok: true });
    }
  }
  return json({ error: 'not found' }, 404);
}

export const onRequest = ({ request, env, params }) =>
  handle(request, env.THRAASU_DB, [].concat(params.path ?? []).join('/')).catch(() => json({ error: 'server' }, 500));
