// Thraasu shop sync. One Pages Function on the app's own origin (so the app's CSP
// `connect-src 'self'` covers it) over one D1 database bound as THRAASU_DB; schema in
// 8_thraasu/tools/schema.sql. A shop is requested from the app (POST signup) and starts pending;
// 8_thraasu/tools/shop-admin.mjs approves it (or makes one directly). Each request is emailed to the
// operator (Worker workers/thraasu-mail, service binding MAILER) with a link to GET/POST review,
// signed with the Pages secret REVIEW_KEY, to approve or reject it from the inbox. A shop's list, its prices and its photos are kept per shop; the
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
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ist = t => new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
// A review link names one shop; its signature is the only credential, so it is checked in constant time.
async function sign(key, code) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('review:' + code)));
}

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
async function signup(request, db, { send, reviewKey }) {
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
    if (r.meta.changes) {
      if (send) send(await requestMail({ code, name, mobile }, new URL(request.url).origin, reviewKey)); else console.log('mail: no MAILER binding');
      return json({ code });
    }
  }
  return json({ error: 'server' }, 500);
}

// The email for a new request: the facts, and a signed link to approve or reject it.
async function requestMail(shop, origin, key) {
  const link = key ? `${origin}/api/thraasu/review?code=${shop.code}&sig=${await sign(key, shop.code)}` : '';
  const facts = [`Shop: ${shop.name}`, `Code: ${shop.code}`, `Owner mobile: ${shop.mobile}`, `Asked: ${ist(Date.now())}`];
  const cli = `node 8_thraasu/tools/shop-admin.mjs approve ${shop.code}`;
  return {
    subject: `New Thraasu shop request: ${shop.name} (${shop.code})`,
    text: [...facts, '', ...(link ? [`Approve or reject: ${link}`] : []), `Or from the repo: ${cli}`].join('\n'),
    html: `<p style="font:16px/1.5 sans-serif">${facts.map(escHtml).join('<br>')}</p>` + (link
      ? `<p><a href="${escHtml(link)}" style="display:inline-block;padding:12px 22px;background:#1E6B3A;color:#fff;border-radius:10px;text-decoration:none;font:600 16px sans-serif">Review and approve</a></p>` : '') +
      `<p style="font:14px sans-serif;color:#4B584F">Or from the repo: <code>${escHtml(cli)}</code></p>`,
  };
}

const page = (title, body, status = 200) => new Response('<!doctype html><html lang="en"><meta charset="utf-8">' +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(title)}</title>` +
  '<style>body{font:17px/1.5 system-ui,sans-serif;max-width:480px;margin:32px auto;padding:0 16px;color:#1C2620;background:#FBF8F1}' +
  'h1{font-size:22px;line-height:1.25}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px}dt{color:#4B584F}dd{margin:0}a{color:#154F2A}' +
  'form{display:flex;gap:10px;margin-top:24px}button{font:inherit;font-weight:650;min-height:48px;padding:0 22px;border-radius:12px;border:0}' +
  '.ok{background:#1E6B3A;color:#fff}.no{background:#F8E0DA;color:#B3301F}</style>' + body, {
  status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
});

// GET shows the request (mail scanners that open links change nothing); POST do=approve|reject acts.
async function review(request, db, key) {
  const q = new URL(request.url).searchParams, code = q.get('code') || '';
  if (!key || !/^[A-Z0-9-]{2,20}$/.test(code) || !sameText(q.get('sig') || '', await sign(key, code))) return page('Link not valid', '<h1>This link is not valid</h1>', 403);
  if (request.method !== 'GET' && request.method !== 'POST') return page('Not allowed', '<h1>Not allowed</h1>', 405);
  let shop = await db.prepare('SELECT code, name, mobile, status, created FROM shops WHERE code = ?').bind(code).first(), done = '';
  if (request.method === 'POST' && shop?.status === 'pending') {
    const act = new URLSearchParams(await request.text()).get('do');
    if (act === 'approve') {
      await db.prepare("UPDATE shops SET status = 'active' WHERE code = ? AND status = 'pending'").bind(code).run();
      shop.status = 'active'; done = 'Approved: the shop can log in now.';
    } else if (act === 'reject') {
      await db.prepare("DELETE FROM shops WHERE code = ? AND status = 'pending'").bind(code).run();
      shop = null; done = 'Rejected: the request is deleted.';
    }
  }
  if (!shop) return page('Shop request', `<h1>${done || 'This request no longer exists'}</h1>`);
  const facts = `<dl><dt>Shop</dt><dd>${escHtml(shop.name)}</dd><dt>Code</dt><dd>${escHtml(shop.code)}</dd>` +
    `<dt>Mobile</dt><dd>${shop.mobile ? `<a href="tel:+91${escHtml(shop.mobile)}">${escHtml(shop.mobile)}</a>` : '–'}</dd><dt>Asked</dt><dd>${escHtml(ist(shop.created))}</dd></dl>`;
  return page(`Shop request ${shop.code}`, shop.status === 'pending'
    ? `<h1>New shop request</h1>${facts}<form method="post"><button class="ok" name="do" value="approve">Approve</button><button class="no" name="do" value="reject">Reject</button></form>`
    : `<h1>${done || 'Approved: this shop can log in.'}</h1>${facts}`);
}

// opts: send(mail) delivers an email (onRequest wires it to the mailer Worker); reviewKey signs review links.
export async function handle(request, db, path, opts = {}) {
  if (request.method === 'POST' && path === 'login') return login(request, db);
  if (request.method === 'POST' && path === 'signup') return signup(request, db, opts);
  if (path === 'review') return review(request, db, opts.reviewKey);
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

// The email goes after the answer (waitUntil); a mailer failure is logged and never fails the request.
export const onRequest = context => {
  const { env } = context;
  const send = env.MAILER && (mail => context.waitUntil(env.MAILER.fetch('https://thraasu-mail/', { method: 'POST', body: JSON.stringify(mail) })
    .then(r => r.ok || console.log('mail: HTTP', r.status)).catch(e => console.log('mail:', e.message))));
  return handle(context.request, env.THRAASU_DB, [].concat(context.params.path ?? []).join('/'), { send, reviewKey: env.REVIEW_KEY })
    .catch(() => json({ error: 'server' }, 500));
};
