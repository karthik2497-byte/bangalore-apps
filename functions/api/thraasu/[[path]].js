// Thraasu shop sync. One Pages Function on the app's own origin (so the app's CSP
// `connect-src 'self'` covers it) over one D1 database bound as THRAASU_DB; schema in
// 8_thraasu/tools/schema.sql. Shops are created by hand with 8_thraasu/tools/shop-admin.mjs:
// there is no sign-up route. A shop's list, its prices and its photos are kept per shop; the
// app works offline and pushes when it can. Last write wins per item.
// Pages does not apply _headers to Functions: every response sets its own headers.

const PBKDF2_ITER = 20000;   // ponytail: a 4-8 digit PIN falls to offline guessing at any cost; the lockout is the guard
const LOCK_AFTER = 5, LOCK_MS = 15 * 60e3, SESSION_MS = 365 * 864e5;
const MAX_PHOTO = 300000, MAX_PHOTOS = 3000, MAX_PRICES = 5000, IDS_PER_GET = 30;
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
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare('UPDATE shops SET failed = 0, locked_until = 0 WHERE code = ?').bind(code),
    db.prepare('INSERT INTO sessions (token, shop, created) VALUES (?, ?, ?)').bind(await sha256(token), code, Date.now()),
  ]);
  return json({ token, shop: { code, name: shop.name } });
}

export async function handle(request, db, path) {
  if (request.method === 'POST' && path === 'login') return login(request, db);
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
      return json({
        shop: { code: shop, name: s.name }, catalog: s.catalog_at ?? null,
        prices: Object.fromEntries(prices.results.map(r => [r.id, r.paise])),
        photos: Object.fromEntries(photos.results.map(r => [r.id, r.at])),
      });
    }
    case 'POST prices': {
      const b = await readJson(request);
      const set = Object.entries(b?.set && typeof b.set === 'object' ? b.set : {}).filter(([id, v]) => ID.test(id) && Number.isInteger(v) && v > 0 && v < 1e9);
      const clear = (Array.isArray(b?.clear) ? b.clear : []).filter(id => typeof id === 'string' && ID.test(id));
      if (set.length + clear.length > MAX_PRICES || await count('prices') + set.length > MAX_PRICES) return json({ error: 'too many' }, 413);
      const at = Date.now();
      const writes = [
        ...set.map(([id, v]) => db.prepare('INSERT INTO prices (shop, id, paise, at) VALUES (?, ?, ?, ?) ON CONFLICT (shop, id) DO UPDATE SET paise = excluded.paise, at = excluded.at').bind(shop, id, v, at)),
        ...clear.map(id => db.prepare('DELETE FROM prices WHERE shop = ? AND id = ?').bind(shop, id)),
      ];
      if (writes.length) await db.batch(writes);
      return json({ ok: true, at });
    }
    case 'PUT photo': {
      const b = await readJson(request);
      if (!ID.test(b?.id ?? '') || typeof b.data !== 'string' || b.data.length > MAX_PHOTO || !PHOTO.test(b.data)) return json({ error: 'bad photo' }, 400);
      if (await count('photos') >= MAX_PHOTOS) return json({ error: 'too many' }, 413);
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
