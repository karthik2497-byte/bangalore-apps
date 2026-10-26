# Thraasu paid shop account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shop account runs until a paid-until date (30 days from approval, then ₹199 a month collected
outside the app); past it the server answers 402, the phone carries on alone with 5 more bills and 5 more new
products, and free phones learn what the account gives from the shop sheet and two hints.

**Architecture:** One column (`shops.paid_until`) and one check folded into the existing session lookup of the
Pages Function; `shop-admin.mjs` sets and extends the date. The single-file PWA keeps `account.paused` and
`account.grace` in its session record, gates the first item of an empty bill and the add-product flow on the
grace, and renders the account line, the paused box and one strip slot in each of the bills sheet and the price
list from that state.

**Tech Stack:** Cloudflare Pages Function + D1 (SQLite), vanilla JS in `8_thraasu/index.html`, `node:sqlite`
unit suite, headless-Chrome browser suite (`scripts/browser/tests/thraasu.mjs`).

Spec: `docs/superpowers/specs/2026-10-24-thraasu-paid-shop-account-design.md`

## Global Constraints

- One app per change-set: Thraasu only (`8_thraasu/`, `functions/api/thraasu/`, its browser suite).
- Every new `localStorage` key starts `thraasu_`: the only new one is `thraasu_hints`.
- No new dependency, origin or CSP change. `node` only runs tests.
- D1 Free: at most 50 queries per invocation; this change adds none (the check rides on the session query).
- `TRIAL_DAYS = 30` in the API module and in the app must agree; `MONTHLY_FEE = 199`; `GRACE = 5`.
- `paid_until` is epoch ms, exclusive, always an IST midnight; `0` until approved.
- No pay button, payment link or phone number in the app (Play consumption-only).
- Design rules (8_thraasu/DESIGN.md): 48 px touch floor, one leaf (primary) button per surface, brass text only
  as brass-ink, chilli only for removal and invalid input, existing font sizes only.
- Browser tests: assert on `textContent`, set state directly late in a suite (MISTAKES.md).
- Commits and pushes only when Karthik says so; `NEXT_STEPS.md` and `EXECUTION_PLAN.md` carry another session's
  uncommitted edits, so stage only this work's hunks there (HEAD-plus-ours blob via `git update-index`).

## File map

- `functions/api/thraasu/[[path]].js`: `TRIAL_DAYS`, `paidThrough`, `endOfDay`; session lookup joins `shops`;
  402 gate; `paid` in `GET state`; trial on the review page's Approve.
- `8_thraasu/tools/schema.sql`: the column. `8_thraasu/tools/migrate-paid.sql` (new): live migration.
- `8_thraasu/tools/shop-admin.mjs`: trial on `add`/`approve`, new `paid`, `list` with `paid_through`.
- `8_thraasu/test-sync.mjs`: server checks.
- `8_thraasu/index.html`: constants, paused/grace logic, gates, account box, strips, signed-out box, CSS.
- `scripts/browser/tests/thraasu.mjs`: browser checks.
- `8_thraasu/privacy.html`: `#delete` anchor, fee text. `8_thraasu/service-worker.js`: cache v17.
- Records: `NEXT_STEPS.md`, `8_thraasu/PRODUCT.md`, `EXECUTION_PLAN.md` §0.4, brain log.

---

### Task 1: Server: the paid-until date and the 402 gate

**Files:**
- Modify: `functions/api/thraasu/[[path]].js` (constants ~line 18; `sessionShop` ~line 72; `handle` ~line 175;
  `GET state`; `review` ~line 158; header comment)
- Modify: `8_thraasu/tools/schema.sql` (shops table)
- Create: `8_thraasu/tools/migrate-paid.sql`
- Test: `8_thraasu/test-sync.mjs`

**Interfaces:**
- Produces: `export const TRIAL_DAYS = 30`; `export const paidThrough(paidUntil: number, days: number, now = Date.now()): number`;
  `export const endOfDay(ymd: string): number | null`; 402 body `{ error: 'paused', until: number }`;
  `GET state` field `paid: number`.

- [ ] **Step 1: Give the test shops a date and write the failing checks.** In `8_thraasu/test-sync.mjs`,
  import the new names and insert NANMA and OTHER with a year of account:

```js
import { handle, pinHash, paidThrough, endOfDay, TRIAL_DAYS } from '../functions/api/thraasu/[[path]].js';
```
```js
raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created, paid_until) VALUES (?, ?, ?, ?, ?, ?)').run('NANMA', 'Nanma Store', salt, await pinHash('482913', salt), Date.now(), Date.now() + 365 * 864e5);
```
```js
  raw.prepare('INSERT INTO shops (code, name, salt, pin_hash, created, paid_until) VALUES (?, ?, ?, ?, ?, ?)').run('OTHER', 'Other', 's2', await pinHash('1111', 's2'), Date.now(), Date.now() + 365 * 864e5);
```

  In the review-link test, after `assert.equal(raw.prepare('SELECT status FROM shops WHERE code = ?').get(code).status, 'active');`:

```js
  const trial = raw.prepare('SELECT paid_until FROM shops WHERE code = ?').get(code).paid_until;
  assert.ok([paidThrough(0, TRIAL_DAYS, before), paidThrough(0, TRIAL_DAYS)].includes(trial), 'approving starts the 30-day trial');
```
  with `const before = Date.now();` as the line before `const a = await call('POST', link, { body: 'do=approve' });`.

  Before the `unknown routes are a JSON 404` test:

```js
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
```

- [ ] **Step 2: Run, expect failure.** `node 8_thraasu/test-sync.mjs` → fails (`paid_until` has no column, or the
  imports are undefined).

- [ ] **Step 3: Schema.** In `8_thraasu/tools/schema.sql`, after the `bills_at INTEGER` line of `shops` (add a comma to it):

```sql
  bills_at INTEGER,                                    -- last change to the shop's bills: MAX(old + 1, now), so it always moves
  paid_until INTEGER NOT NULL DEFAULT 0                -- the account works until then (exclusive, an IST midnight): 30 days from approval, then paid; 0 while pending
```

- [ ] **Step 4: Migration file** `8_thraasu/tools/migrate-paid.sql`:

```sql
-- One-off, 2026-10-24: a shop account runs until paid_until (30 days from approval, then paid). Run once against
-- the live database, before deploying the code that reads it:
--   npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-paid.sql
ALTER TABLE shops ADD COLUMN paid_until INTEGER NOT NULL DEFAULT 0;
-- The shops already approved (NANMA, the pilot) run through 31 Mar 2027: until 1 Apr 2027 00:00 IST.
UPDATE shops SET paid_until = 1806517800000 WHERE status = 'active';
```

- [ ] **Step 5: API.** In `functions/api/thraasu/[[path]].js`, after the `BILLS_KEEP_MS` line:

```js
// A shop account runs until paid_until (epoch ms, exclusive, always an IST midnight): 30 days from approval, then
// what the shop pays for (shop-admin.mjs paid). Past it every route but logout answers 402; the phone carries on alone.
export const TRIAL_DAYS = 30;
const DAY = 864e5, IST = 330 * 60e3;
// The end after adding `days`: from the current end, or from tomorrow (IST) once that has passed.
export const paidThrough = (paidUntil, days, now = Date.now()) => Math.max(paidUntil, Math.floor((now + IST) / DAY) * DAY - IST + DAY) + days * DAY;
// The end for "paid through 2027-03-31": the IST midnight after that day; null for anything but a real date.
export const endOfDay = ymd => {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? Date.parse(ymd + 'T00:00:00+05:30') : NaN;
  return Number.isFinite(t) && new Date(t + IST).toISOString().slice(0, 10) === ymd ? t + DAY : null;
};
```

  `sessionShop` returns the row with the date:

```js
// Sessions are stored as the SHA-256 of the token, so a copy of the database holds no live login. The shop's
// paid_until comes with it, so the paid check costs no query of its own.
async function sessionShop(request, db) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const row = await db.prepare('SELECT s.shop, s.created, p.paid_until FROM sessions s JOIN shops p ON p.code = s.shop WHERE s.token = ?').bind(await sha256(m[1])).first();
  return row && Date.now() - row.created < SESSION_MS ? row : null;
}
```

  In `handle`, replace the two session lines:

```js
  const session = await sessionShop(request, db);
  if (!session) return json({ error: 'login' }, 401);
  const shop = session.shop;
  // Past its date the shop's phones carry on alone: only logging out still goes through.
  if (Date.now() >= session.paid_until && !(request.method === 'POST' && path === 'logout')) return json({ error: 'paused', until: session.paid_until }, 402);
```

  In `GET state`'s JSON, after `bills: s.bills_at ?? null,` add `paid: session.paid_until,`.

  In `review`, the Approve update:

```js
      await db.prepare("UPDATE shops SET status = 'active', paid_until = ? WHERE code = ? AND status = 'pending'").bind(paidThrough(0, TRIAL_DAYS), code).run();
```

  In the header comment, after the sentence ending "…to approve or reject it from the inbox.": "An approved shop
  runs until its paid_until (30 days, then paid; shop-admin.mjs paid); past it the API answers 402."

- [ ] **Step 6: Run, expect pass.** `node 8_thraasu/test-sync.mjs` → `OK: N checks passed`.

- [ ] **Step 7: Commit** (when Karthik says go): `git add` the four files; message
  "Thraasu sync: a shop account runs until paid_until (30 days from approval); past it, 402".

### Task 2: shop-admin: trial on add/approve, `paid`, `list`

**Files:**
- Modify: `8_thraasu/tools/shop-admin.mjs` (usage lines 2-10; import line; `add`; `approve`; `list`; the usage slice)

**Interfaces:**
- Consumes: `paidThrough`, `endOfDay`, `TRIAL_DAYS` from Task 1.

- [ ] **Step 1: Usage and import.** Usage block becomes (one line added, two reworded):

```js
//   node 8_thraasu/tools/shop-admin.mjs add CODE "Shop name" [PIN]   new shop (30 days, then paid); prints the PIN once
//   node 8_thraasu/tools/shop-admin.mjs paid CODE +30 | YYYY-MM-DD   extend: 30 more days, or through that day (IST)
```
```js
//   node 8_thraasu/tools/shop-admin.mjs approve CODE                 let a requested shop log in (30 days, then paid)
```
```js
import { pinHash, paidThrough, endOfDay, TRIAL_DAYS } from '../../functions/api/thraasu/[[path]].js';
const lastDay = until => new Date(until - 1).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
```
  and the usage print at the bottom becomes `.slice(1, 12)`.

- [ ] **Step 2: `add` and `approve` set the trial.**

```js
  const until = paidThrough(0, TRIAL_DAYS);
  d1(`INSERT INTO shops (code, name, salt, pin_hash, created, paid_until) VALUES (${q(code)}, ${q(arg)}, ${q(salt)}, ${q(await pinHash(pin, salt))}, ${Date.now()}, ${until});`);
  console.log(`added ${code} "${arg}"  PIN ${pin}  (give it to the shop; it is not stored anywhere readable); runs through ${lastDay(until)}`);
```
```js
  const until = paidThrough(0, TRIAL_DAYS);
  d1(cmd === 'approve' ? `UPDATE shops SET status = 'active', paid_until = ${until} WHERE code = ${q(code)};` : `DELETE FROM shops WHERE code = ${q(code)} AND status = 'pending';`);
  console.log(cmd === 'approve' ? `${code} approved: it can log in now; runs through ${lastDay(until)}` : `${code} request deleted`);
```

- [ ] **Step 3: `paid`.** A new branch before `list`:

```js
} else if (cmd === 'paid') {
  needCode();
  const [shop] = d1read(`SELECT paid_until FROM shops WHERE code = ${q(code)} AND status = 'active'`);
  if (!shop) die(`${code} is not an approved shop`);
  const until = /^\+\d{1,3}$/.test(arg || '') ? paidThrough(shop.paid_until, Number(arg.slice(1))) : endOfDay(arg || '');
  if (!until) die('paid CODE +DAYS, or paid CODE YYYY-MM-DD (its last day, IST)');
  d1(`UPDATE shops SET paid_until = ${until} WHERE code = ${q(code)};`);
  console.log(`${code} runs through ${lastDay(until)}`);
```

- [ ] **Step 4: `list`** adds, after `s.status,`:
  `CASE WHEN s.paid_until > 0 THEN date((s.paid_until - 1) / 1000, 'unixepoch', '+330 minutes') END AS paid_through,`
  and ends `ORDER BY s.status = 'pending', s.paid_until` (soonest first; pending last).

- [ ] **Step 5: Check.** `node --check 8_thraasu/tools/shop-admin.mjs` and `node 8_thraasu/tools/shop-admin.mjs`
  (no command: prints the 11 usage lines including `paid`, exit 1, no network).

- [ ] **Step 6: Commit** (when Karthik says go): "shop-admin: trial on add/approve, paid CODE +30|date, list shows paid_through".

### Task 3: App: paused mode, grace, gates, logout

**Files:**
- Modify: `8_thraasu/index.html`: constants (~line 911), `let signingUp` (~1207), `stockLeft` (~1228), `api`
  (~1235), `fetchCatalog` (~1243), `queue` (~1259), `sync` (state and catch, ~1395-1410), `logout` (~1456),
  `markSold` (~990), `openSheet` (~1586), `openAdd` (~1920), `saveAdd` (~1969), the `acctBtn` handler (~2049).
- Test: `scripts/browser/tests/thraasu.mjs` (a new block after the shop-account block's checks)

**Interfaces:**
- Produces (globals the later tasks and tests use): `MONTHLY_FEE`, `TRIAL_DAYS`, `GRACE`, `HINTS_KEY`, `OFFER`;
  `daysLeft(until)`, `lastDay(until)`, `graceLeft(kind)`, `blocked(kind)`, `useGrace(kind)` (`kind`: `'bills' | 'items'`);
  `openShop()`; `let loginOpen`; `account.paused: number` and `account.grace: { bills, items }`; `synced.paid`.

- [ ] **Step 1: Failing browser checks.** After the `t.check` lines of the shop-account (`sy`) block, add a block
  with its own fake server (kept on `window.__srv` for Task 4), logging in as NANMA:

```js
  // A shop account with a date: the server says when it ends; past it, 402 and the phone carries on alone with
  // 5 more bills and 5 new products; a renewal brings everything back; logging out is the way to go free.
  const pz = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const until = async ok => { for (let i = 0; i < 60 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); };
    const srv = window.__srv = { paid: Date.now() + 20 * 864e5, paused: false, calls: 0, token: null, stock: { onion: 3000 },
      catalog: { sample: false, categories: [{ id: 'veg', ml: 'പച്ചക്കറി', en: 'Vegetables', icon: '🥬' }], products: [
        { id: 'tomato', cat: 'veg', ml: 'തക്കാളി', en: 'Tomato', icon: '🍅', unit: 'kg', rate: 44 },
        { id: 'onion', cat: 'veg', ml: 'സവാള', en: 'Onion', icon: '🧅', unit: 'kg', rate: 50 },
        { id: 'shallot', cat: 'veg', ml: 'ചെറിയ ഉള്ളി', en: 'Shallots', icon: '🧅', unit: 'kg', rate: 90 }] } };
    window.__realFetch = window.__realFetch || window.fetch;
    window.fetch = async (u, o = {}) => {
      const url = String(u);
      if (!url.includes('/api/thraasu/')) return window.__realFetch(u, o);
      const [route] = url.split('/api/thraasu/')[1].split('?'), m = (o.method || 'GET') + ' ' + route, body = o.body ? JSON.parse(o.body) : null;
      const res = (b, status = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status });
      srv.calls++;
      if (m === 'POST login') return res({ token: srv.token = 'b'.repeat(64), shop: { code: 'NANMA', name: 'Nanma Store' } });
      if (o.headers?.authorization !== 'Bearer ' + srv.token) return res({ error: 'login' }, 401);
      if (m === 'POST logout') { srv.token = null; return res({ ok: true }); }
      if (srv.paused) return res({ error: 'paused', until: srv.paid }, 402);
      if (m === 'GET catalog') return res(JSON.stringify(srv.catalog));
      if (m === 'GET state') return res({ shop: { code: 'NANMA', name: 'Nanma Store' }, catalog: 1, prices: {}, photos: {}, stock: srv.stock, items: null, hidden: [], bills: null, paid: srv.paid });
      if (m === 'GET bills') return res({ at: null, bills: [] });
      return res({ ok: true, dup: [], at: Date.now() });
    };
    const r = {};
    localStorage.removeItem('thraasu_signup');
    await login('NANMA', '482913');
    r.in = [account?.code, synced.paid === srv.paid, products.length, stockLeft('onion')];
    srv.paused = true; srv.paid = Date.now() - 3600e3;
    await sync();
    r.paused = [account.paused === srv.paid, JSON.stringify(account.grace), stockLeft('onion'), syncError];
    await loadCatalog(); r.ownList = [products.length, byId.has('shallot')];
    srv.calls = 0; setMine(byId.get('onion'), 5700); await new Promise(res => setTimeout(res, 1800));
    r.noTimer = [srv.calls, pending() > 0];
    for (let i = 0; i < 5; i++) { bill = freshBill(nextNo()); openSheet(asItem(byId.get('tomato'))); setQty(500); commit(); bill.pay = 'cash'; markSold(); }
    r.fiveBills = [account.grace.bills, blocked('bills')];
    bill = freshBill(nextNo()); saveBill(); renderBill();
    openSheet(asItem(byId.get('tomato'))); r.sixth = [sheetEl.open, shopEl.open]; shopEl.close();
    account.grace.bills = 4; openSheet(asItem(byId.get('tomato'))); setQty(500); commit(); account.grace.bills = 5;
    openSheet(asItem(byId.get('onion'))); r.started = sheetEl.open; sheetEl.close();   // a bill already started still takes items
    account.grace.items = 4;
    openAdd('കോവക്ക', 'veg'); $('addForm').requestSubmit(); $('addRate').value = '80'; $('addForm').requestSubmit();
    r.fifthItem = [account.grace.items, blocked('items'), Object.values(shopItems).some(x => x.ml === 'കോവക്ക')];
    openAdd('വെണ്ട', 'veg'); r.addBlocked = [addEl.open, shopEl.open]; shopEl.close(); hideToast();
    srv.paused = false; srv.paid = Date.now() + 30 * 864e5;
    await sync();
    r.renewed = [account.paused, account.grace, pending(), stockLeft('onion')];
    srv.paused = true; srv.paid = Date.now() - 1000; await sync();
    setMine(byId.get('onion'), 5800);
    r.lo1 = [await logout(), !!account];
    r.lo2 = [await logout(), account];
    await until(() => products.length > 10);
    bill = freshBill(1); saveBill(); renderBill();
    return r;
  });
  t.check('an account carries its date; stock counts while paid', pz.in[0] === 'NANMA' && pz.in[1] && pz.in[2] === 3 && pz.in[3] === 3000, pz.in);
  t.check('a 402 pauses the phone: grace starts at 0/0, stock counts hide', pz.paused.join() === 'true,{"bills":0,"items":0},,paused', pz.paused);
  t.check("paused, the phone keeps the shop's own list, not the template", pz.ownList.join() === '3,true', pz.ownList);
  t.check('paused, a change waits on the phone and starts no sync timer', pz.noTimer.join() === '0,true', pz.noTimer);
  t.check('5 bills sold while paused use the grace; the first item of a 6th opens the shop sheet', pz.fiveBills.join() === '5,true' && pz.sixth.join() === 'false,true', [pz.fiveBills, pz.sixth]);
  t.check('a bill already started still takes items', pz.started === true, pz.started);
  t.check('the 5th new product is added; the 6th opens the shop sheet', pz.fifthItem.join() === '5,true,true' && pz.addBlocked.join() === 'false,true', [pz.fifthItem, pz.addBlocked]);
  t.check('renewed: paused and grace clear, changes go up, stock counts again', pz.renewed[0] === undefined && pz.renewed[1] === undefined && pz.renewed[2] === 0 && pz.renewed[3] !== null, pz.renewed);
  t.check('paused with unsent changes, logout asks for a second tap, then goes free', pz.lo1[0].includes('ഒന്നുകൂടി തൊട്ടാൽ ലോഗൗട്ട്') && pz.lo1[1] === true && pz.lo2.join() === ',', [pz.lo1, pz.lo2]);
```

- [ ] **Step 2: Run, expect failure.** `bash scripts/browser-smoke.sh` → the new Thraasu checks fail.

- [ ] **Step 3: Constants** (replacing the `MONTHLY_FEE` comment and line):

```js
const HINTS_KEY = 'thraasu_hints';     // { bills: 1, prices: 1 }: the free-phone hints closed on this phone
// The shop account: TRIAL_DAYS free from approval (the API's TRIAL_DAYS must match), then MONTHLY_FEE rupees a
// month, collected outside the app (Play consumption-only: no pay button or link here). Past its date a phone
// carries on alone for GRACE more bills and GRACE new products.
const MONTHLY_FEE = 199, TRIAL_DAYS = 30, GRACE = 5;
const OFFER = `${TRIAL_DAYS} ദിവസം സൗജന്യം · പിന്നെ മാസം ₹${MONTHLY_FEE}`;
```

- [ ] **Step 4: Paused-state helpers**, after `let signingUp = false; …`:

```js
let loginOpen = false;                                 // the login form, behind its button until tapped or a request waits
// The account's end (exclusive, an IST midnight): whole days after today, and its last day, on the phone's clock.
const daysLeft = until => Math.floor((until - Date.now()) / 864e5);
const lastDay = until => new Date(until - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
// Paused (account.paused: the server's date), a phone may still sell GRACE bills and add GRACE new products.
const graceLeft = kind => GRACE - (account?.grace?.[kind] || 0);
const blocked = kind => !!account?.paused && graceLeft(kind) <= 0;
function useGrace(kind) {
  if (!account?.paused) return;
  account = { ...account, grace: { ...account.grace, [kind]: (account.grace?.[kind] || 0) + 1 } };
  writeJSON(SESSION_KEY, account);
}
```

- [ ] **Step 5: `stockLeft`** first line:

```js
  if (account?.paused || !synced.stock || !Object.hasOwn(synced.stock, id)) return null;   // paused: other phones' sales stop counting
```

- [ ] **Step 6: `api`**, after the 401 line:

```js
  if (res.status === 402 && account && !account.paused) {   // past the shop's date: the phone carries on alone
    const { until } = await res.clone().json().catch(() => ({}));
    account = { ...account, paused: until || Date.now(), grace: { bills: 0, items: 0 } };
    writeJSON(SESSION_KEY, account);
  }
```

- [ ] **Step 7: `fetchCatalog`**, after the 404 line:

```js
      if (r.status === 402) { const cached = readJSON(CATALOG_KEY); if (cached) return cached; }   // paused: the list it had
```

- [ ] **Step 8: `queue`**, the last two lines become:

```js
  renderSync();
  if (account.paused) return;                            // paused: it goes up once the shop is renewed
  clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500);
```

- [ ] **Step 9: `sync`.** The account and `synced` lines after `GET state` become:

```js
      const { paused, grace, ...acct } = account;        // a good state: the account runs (again)
      account = { ...acct, name: st.shop.name }; writeJSON(SESSION_KEY, account);
      const listChanged = st.catalog !== (synced.catalog ?? null);
      synced = { ...synced, at: Date.now(), catalog: st.catalog, items: st.items ?? null, stock: st.stock || {}, bills: billsAt, paid: st.paid ?? null };
```
  and the catch:
```js
    } catch { syncError = account?.paused ? 'paused' : navigator.onLine === false ? 'offline' : 'server'; }
```

- [ ] **Step 10: Grace counts and gates.**

```js
function markSold() { if (!bill.sold) { bill.sold = true; useGrace('bills'); saveBill(); } }
```
  `openSheet`, first line: `if (!bill.lines.length && blocked('bills')) return openShop();   // paused, its grace used: renew or go free`
  `openAdd`, first line: `if (blocked('items')) return openShop();`
  `saveAdd`, after `setItem(id, item);`: `useGrace('items');`

- [ ] **Step 11: `logout`** becomes:

```js
// Logging out leaves nothing of the shop on the phone, so it waits until nothing is unsent. Paused, it is how a
// shop goes on free: a second tap within 8 s logs out anyway.
let logoutAsked = 0;
async function logout() {
  await sync();
  if (pending() && !(account?.paused && Date.now() - logoutAsked < 8000)) {
    if (!account?.paused) return `${pending()} മാറ്റം ഇനിയും സെർവറിൽ എത്തിയിട്ടില്ല: ഇന്റർനെറ്റ് ഉള്ളപ്പോൾ ലോഗൗട്ട് ചെയ്യൂ`;
    logoutAsked = Date.now();
    return `${pending()} മാറ്റം കടയിലേക്ക് പോകില്ല · ഒന്നുകൂടി തൊട്ടാൽ ലോഗൗട്ട്`;
  }
  logoutAsked = 0;
  try { await api('logout', { method: 'POST' }); } catch {}
  signOut(true);
  return '';
}
```

- [ ] **Step 12: `openShop`** replaces the `acctBtn` handler body:

```js
// The shop sheet: from the shop button, a hint, a strip or a used-up grace (closing the sheet it came from).
function openShop() {
  for (const d of [billsEl, pricesEl, sheetEl, addEl]) if (d.open) d.close();
  signingUp = false; loginOpen = false; renderSync(); $('loginMsg').hidden = $('logoutMsg').hidden = true;
  const req = readJSON(SIGNUP_KEY);
  if (req && !$('shopCode').value) $('shopCode').value = req.code;
  shopEl.showModal(); if (account) sync();
}
$('acctBtn').addEventListener('click', openShop);
```

- [ ] **Step 13: Run, expect pass.** `bash scripts/browser-smoke.sh` (Thraasu checks) and `node --check` on the
  extracted script.

- [ ] **Step 14: Commit** (when Karthik says go).

### Task 4: App: the account box and the strips

**Files:**
- Modify: `8_thraasu/index.html`: CSS (after `.box .small`, the `.acct` dot rules, `#syncState`); bills sheet HTML
  (after `#payFilter`); prices sheet HTML (after `.prices-search`); signed-in box HTML; `renderSync`; `showPast`
  subtitle; `openBills`; `openPrices`; listeners.
- Test: `scripts/browser/tests/thraasu.mjs`

**Interfaces:**
- Consumes: Task 3's globals and `window.__srv`.
- Produces: `renderNotes()`, `#planLine`, `#pausedNote`, `#graceLine`, `#renewLine`, `#billsNote`, `#pricesNote`,
  `NOTE_ICON`.

- [ ] **Step 1: Failing checks**, a block after `pz`'s checks:

```js
  // What the account box and the bills sheet say: days left, the last 5 days, paused with the grace left.
  const pu = await t.evaluate(async () => {
    const $ = id => document.getElementById(id), srv = window.__srv;
    srv.paused = false; srv.paid = Date.now() + 3.5 * 864e5;
    await login('NANMA', '482913');
    const r = {};
    openShop(); await sync();
    r.ending = [$('planLine').dataset.state, $('planLine').textContent.includes('3 ദിവസം ബാക്കി'), !!$('signedIn').querySelector('a[href="./privacy.html#delete"]'), $('acctBtn').dataset.state];
    shopEl.close(); openBills();
    r.strip = [$('billsNote').hidden, $('billsNote').dataset.kind, $('billsNote').textContent.includes('കാലാവധി 3 ദിവസം കൂടി'), $('billsNote').textContent.includes('₹199'), !$('billsNote').querySelector('.note-x')];
    $('billsNote').querySelector('.note-go').click(); r.go = [billsEl.open, shopEl.open]; shopEl.close();
    srv.paid = Date.now() + 20 * 864e5; await sync(); openBills(); r.calm = $('billsNote').hidden; billsEl.close();
    srv.paused = true; srv.paid = Date.now() - 1000; await sync();
    openShop(); await sync();
    r.paused = [$('planLine').dataset.state, $('planLine').textContent.includes('കഴിഞ്ഞു'), $('pausedNote').hidden, $('graceLine').textContent, $('renewLine').textContent, $('syncNow').textContent, $('shopSub').textContent, $('acctBtn').dataset.state];
    shopEl.close(); openBills();
    r.billsPaused = [$('billsNote').dataset.kind, $('billsNote').textContent.includes('സിങ്ക് നിർത്തിവെച്ചു'), $('billsSub').textContent.endsWith('സിങ്ക് നിർത്തിവെച്ചു')];
    billsEl.close();
    account.grace = { bills: 5, items: 2 }; renderSync(); r.used = $('graceLine').textContent;
    srv.paused = false; srv.paid = Date.now() + 30 * 864e5; await sync();
    r.out = [await logout(), account];
    window.fetch = window.__realFetch;
    return r;
  });
  t.check('3 days left: a brass account line, a delete-account link', pu.ending.join() === 'ending,true,true,ok', pu.ending);
  t.check('the last days show in the bills sheet, with the price, no ✕, and open the shop sheet', pu.strip.join() === 'false,end,true,true,true' && pu.go.join() === 'false,true' && pu.calm === true, [pu.strip, pu.go, pu.calm]);
  t.check('paused: the box says so, with the grace left, the renewal line and check-again', pu.paused.join('|') === 'over|true|false|ഈ ഫോണിൽ: ഇനി 5 ബിൽ കൂടി · 5 പുതിയ സാധനം കൂടി|തുടരാൻ മാസം ₹199 · ഞങ്ങൾ വിളിക്കും|വീണ്ടും നോക്കുക|സിങ്ക് നിർത്തിവെച്ചു · ഈ ഫോണിൽ സൂക്ഷിക്കുന്നു|paused', pu.paused);
  t.check('paused: the bills sheet strip and subtitle say sync stopped', pu.billsPaused.join() === 'end,true,true', pu.billsPaused);
  t.check('a used-up grace says what waits for the renewal', pu.used === 'ഈ ഫോണിൽ: പുതിയ ബിൽ പുതുക്കിയ ശേഷം · 3 പുതിയ സാധനം കൂടി', pu.used);
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: CSS**, after `.box .small { font-size: 14px; }`:

```css
.box .plan { display: grid; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--leaf-wash); color: var(--leaf-deep); }
.box .plan[hidden], .paused[hidden], .note[hidden] { display: none; }
.box .plan b { font-size: 16px; font-weight: 700; }
.box .plan span { font-size: 14px; color: var(--ink-2); }
.box .plan[data-state="ending"], .box .plan[data-state="over"] { background: var(--brass-wash); color: var(--ink); }
.paused { display: grid; gap: 10px; }
.box a.small { justify-self: start; padding: 4px 0; color: var(--leaf-deep); }
/* the strip in the bills sheet and the price list: what the account adds, its last days, or paused */
.note { display: flex; align-items: center; margin: 12px 16px 0; border: 1px solid var(--line); border-radius: var(--r); background: var(--paper); }
.note[data-kind="end"] { border-color: transparent; background: var(--brass-wash); }
.note-go { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 12px 4px 12px 12px; border: 0; background: none; text-align: left; color: var(--ink); }
.note-go svg { flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.note-go svg:first-child { width: 36px; height: 36px; padding: 8px; border-radius: 50%; background: var(--leaf-wash); color: var(--leaf-deep); }
.note[data-kind="end"] .note-go svg:first-child { background: var(--slip); color: var(--brass-ink); }
.note-go svg:last-child { width: 20px; height: 20px; color: var(--ink-2); }
.note-go span { flex: 1; min-width: 0; display: grid; gap: 1px; }
.note-go b { font-size: 15px; font-weight: 680; }
.note-go small { font-size: 14px; line-height: 1.35; color: var(--ink-2); }
.note-x { flex: none; width: 44px; min-height: 48px; border: 0; background: none; font-size: 16px; color: var(--ink-2); }
```
  The dot rule gains `paused`: `.acct[data-state="wait"]::after, .acct[data-state="busy"]::after, .acct[data-state="paused"]::after { background: var(--brass); }`;
  and `#syncState[data-state="wait"], #syncState[data-state="paused"] { color: var(--brass-ink); }`.

- [ ] **Step 4: HTML.** After the `#payFilter` div: `<div class="note" id="billsNote" hidden></div>`.
  After the prices sheet's search div: `<div class="note" id="pricesNote" hidden></div>`.
  The signed-in box:

```html
    <section class="box" id="signedIn" hidden>
      <h3 id="acctName"></h3>
      <p class="plan" id="planLine" hidden></p>
      <div class="paused" id="pausedNote" hidden>
        <p>ഈ ഫോണിലെ ബില്ലുകളും വിലയും ഇവിടെത്തന്നെയുണ്ട്; പുതിയ മാറ്റങ്ങളും ഫോണിൽ സൂക്ഷിക്കും. പുതുക്കിയാൽ അവ തനിയെ മറ്റു ഫോണുകളിലെത്തും.</p>
        <p class="fee" id="renewLine"></p>
        <p id="graceLine"></p>
        <p class="small">അല്ലെങ്കിൽ ലോഗൗട്ട് ചെയ്ത് ഈ ഫോണിൽ സൗജന്യമായി തുടരാം; കടയുടെ വിവരങ്ങൾ സെർവറിൽ സുരക്ഷിതം. ബാക്കപ്പ് എടുത്താൽ വിലയും ഫോട്ടോയും കൂടെ കൊണ്ടുപോകാം.</p>
      </div>
      <p id="syncState" role="status"></p>
      <div class="two"><button class="btn ghost" id="syncNow" type="button">ഇപ്പോൾ സിങ്ക്</button><button class="btn quiet" id="logoutBtn" type="button">ലോഗൗട്ട്</button></div>
      <p class="hint" id="logoutMsg" role="alert" hidden></p>
      <a class="small" href="./privacy.html#delete" target="_blank" rel="noopener">കടയുടെ അക്കൗണ്ട് ഇല്ലാതാക്കാൻ</a>
    </section>
```

- [ ] **Step 5: `renderNotes` and its icons**, before `renderSync`:

```js
// One strip each in the bills sheet and the price list: on a free phone what the account adds (until its ✕); with
// an account its last 5 days, or that it is paused. Every strip opens the shop sheet. No user text goes in.
const NOTE_ICON = {
  phones: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7.5" height="15" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="15" rx="1.5"/><path d="M6 16h1.5M16.5 16h1.5"/></svg>',
  stock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/></svg>',
};
const hints = () => readJSON(HINTS_KEY) || {};
function renderNotes() {
  const until = account && (account.paused || synced.paid), left = until ? daysLeft(until) : null;
  note($('billsNote'), 'bills', !account ? !hints().bills && ['free', NOTE_ICON.phones, 'ഈ ഫോണിലെ ബില്ലുകൾ മാത്രം', 'കടയിലെ എല്ലാ ഫോണിലെയും ബില്ലുകൾ ഒന്നിച്ച് ഇവിടെ കാണാൻ: കട അക്കൗണ്ട്']
    : account.paused ? ['end', NOTE_ICON.pause, 'സിങ്ക് നിർത്തിവെച്ചു', 'മറ്റു ഫോണുകളിലെ പുതിയ ബില്ലുകൾ വരില്ല: കട']
    : until && left < 5 ? ['end', NOTE_ICON.clock, left > 0 ? `കാലാവധി ${left} ദിവസം കൂടി` : 'കാലാവധി ഇന്നു തീരും', `${lastDay(until)} വരെ · തുടരാൻ മാസം ₹${MONTHLY_FEE} · ഞങ്ങൾ വിളിക്കും`]
    : null);
  note($('pricesNote'), 'prices', !account && !hints().prices && ['free', NOTE_ICON.stock, 'സ്റ്റോക്ക് എത്ര ബാക്കി?', 'ബിൽ ചെയ്യുമ്പോൾ ഓരോ സാധനത്തിന്റെയും സ്റ്റോക്ക് തനിയെ കുറയും: കട അക്കൗണ്ട്']);
}
function note(el, key, n) {
  el.hidden = !n;
  if (!n) return;
  const [kind, icon, title, line] = n;
  el.dataset.kind = kind;
  el.innerHTML = `<button class="note-go" type="button">${icon}<span><b>${title}</b><small>${line}</small></span>${NEXT}</button>` +
    (kind === 'free' ? `<button class="note-x" type="button" aria-label="മറയ്ക്കുക" data-hint="${key}">✕</button>` : '');
}
```

- [ ] **Step 6: `renderSync`** becomes:

```js
function renderSync() {
  const n = pending(), paused = account?.paused;
  const state = !account ? 'out' : paused ? 'paused' : syncing ? 'busy' : syncError || n ? 'wait' : 'ok';
  $('acctBtn').dataset.state = state;
  $('signedOut').hidden = !!account || signingUp; $('signedIn').hidden = !account; $('signupBox').hidden = !!account || !signingUp;
  const req = !account && readJSON(SIGNUP_KEY);
  $('reqNote').hidden = !req;
  if (req) $('reqNote').innerHTML = `അപേക്ഷ അയച്ചു: <b>${esc(req.name)}</b><span class="code">${esc(req.code)}</span>അംഗീകരിച്ചു കഴിഞ്ഞാൽ ഈ കോഡും പിനും കൊണ്ട് ലോഗിൻ ചെയ്യാം.`;
  $('shopSub').textContent = !account ? 'ഇപ്പോൾ ഈ ഫോണിൽ മാത്രം' : paused ? 'സിങ്ക് നിർത്തിവെച്ചു · ഈ ഫോണിൽ സൂക്ഷിക്കുന്നു' : 'സെർവറിൽ സൂക്ഷിക്കുന്നു · ഫോണിലും';
  renderNotes();
  if (!account) return;
  $('acctName').textContent = `${account.name} · ${account.code}`;
  const until = paused || synced.paid, left = until ? daysLeft(until) : 0;
  $('planLine').hidden = !until;
  $('planLine').dataset.state = paused ? 'over' : left < 5 ? 'ending' : 'ok';
  $('planLine').innerHTML = !until ? '' : paused
    ? `<b>കാലാവധി ${lastDay(until)}-ന് കഴിഞ്ഞു</b><span>സിങ്കും എല്ലാ ഫോണിലെയും ബില്ലുകളും സ്റ്റോക്കും നിർത്തിവെച്ചു.</span>`
    : `<b>കാലാവധി ${lastDay(until)} വരെ · ${left > 0 ? `${left} ദിവസം ബാക്കി` : 'ഇന്ന് അവസാന ദിവസം'}</b>`;
  $('pausedNote').hidden = !paused;
  const b = graceLeft('bills'), i = graceLeft('items');
  $('graceLine').textContent = 'ഈ ഫോണിൽ: ' + [b > 0 ? `ഇനി ${b} ബിൽ കൂടി` : 'പുതിയ ബിൽ പുതുക്കിയ ശേഷം', i > 0 ? `${i} പുതിയ സാധനം കൂടി` : 'പുതിയ സാധനം പുതുക്കിയ ശേഷം'].join(' · ');
  $('syncNow').textContent = paused ? 'വീണ്ടും നോക്കുക' : 'ഇപ്പോൾ സിങ്ക്';
  $('syncState').dataset.state = state;
  $('syncState').textContent = state === 'busy' ? 'സിങ്ക് ചെയ്യുന്നു…'
    : syncError === 'offline' ? `ഓഫ്‌ലൈൻ · ${n} മാറ്റം കാത്തിരിക്കുന്നു`
    : syncError === 'server' ? `സെർവർ കിട്ടിയില്ല · ${n} മാറ്റം കാത്തിരിക്കുന്നു`
    : n ? `${n} മാറ്റം കാത്തിരിക്കുന്നു`
    : synced.at && !paused ? `എല്ലാം സിങ്ക് ആയി · ${fmtDate(synced.at)}` : '';
}
```

- [ ] **Step 7: Bills and prices.** `showPast`'s list subtitle:
  `` : `ഇന്നും ഇന്നലെയും · ${!account ? 'ഈ ഫോണിൽ' : account.paused ? 'സിങ്ക് നിർത്തിവെച്ചു' : 'കടയിലെ എല്ലാ ഫോണിലും'}`; ``
  and at its end `if (past) $('billsNote').hidden = true; else renderNotes();`.
  `openPrices` calls `renderNotes();` before `pricesEl.showModal();`.
  Listeners, next to `$('billsClose')`:

```js
for (const el of [$('billsNote'), $('pricesNote')]) el.addEventListener('click', e => {
  const x = e.target.closest('.note-x');
  if (x) { writeJSON(HINTS_KEY, { ...hints(), [x.dataset.hint]: 1 }); renderNotes(); return; }
  if (e.target.closest('.note-go')) openShop();
});
$('renewLine').textContent = `തുടരാൻ മാസം ₹${MONTHLY_FEE} · ഞങ്ങൾ വിളിക്കും`;
```

- [ ] **Step 8: Run, expect pass.** `bash scripts/browser-smoke.sh`.

- [ ] **Step 9: Commit** (when Karthik says go).

### Task 5: App: what a free phone sees

**Files:**
- Modify: `8_thraasu/index.html`: CSS (`.uses`), signed-out box HTML, the `feeLine` line, a `loginOpen` listener,
  `renderSync` (login form and register button).
- Test: `scripts/browser/tests/thraasu.mjs` (the signup check's fee text; a new block before the `su` block)

- [ ] **Step 1: Failing checks.** The sign-up check's expected fee text becomes the offer:

```js
  t.check('sign-up opens from the shop sheet: the offer shown, policy linked, 48 px button', su.closed.join() === 'true,false,true,' + su.closed[3] && su.closed[3] >= 48 &&
    su.open.join() === 'false,true,suName,30 ദിവസം സൗജന്യം · പിന്നെ മാസം ₹199,true', su);
```
  A new block right before the `su` block (a free phone, no account):

```js
  // A free phone: the shop sheet says what the account gives and what it costs; one hint in Bills and one in
  // Prices open it, and a ✕ hides a hint for good on this phone.
  localStorage.removeItem('thraasu_hints');
  const fr = await t.evaluate(async () => {
    const $ = id => document.getElementById(id), r = {};
    renderSync(); openBills();
    r.bills = [$('billsNote').hidden, $('billsNote').dataset.kind, $('billsNote').textContent.includes('ഈ ഫോണിലെ ബില്ലുകൾ മാത്രം'), Math.round($('billsNote').querySelector('.note-x').getBoundingClientRect().height)];
    $('billsNote').querySelector('.note-x').click();
    r.closed = [$('billsNote').hidden, localStorage.getItem('thraasu_hints')];
    billsEl.close(); openPrices();
    r.prices = [$('pricesNote').hidden, $('pricesNote').textContent.includes('സ്റ്റോക്ക് എത്ര ബാക്കി?')];
    $('pricesNote').querySelector('.note-go').click();
    r.go = [pricesEl.open, shopEl.open];
    r.offer = [$('offerLine').textContent, $('signedOut').querySelectorAll('.uses li').length, $('loginForm').hidden, $('loginOpen').hidden, $('signupOpen').classList.contains('primary')];
    $('loginOpen').click();
    r.login = [$('loginForm').hidden, $('loginOpen').hidden, document.activeElement.id, $('signupOpen').classList.contains('primary')];
    shopEl.close();
    return r;
  });
  t.check('free: a hint in Bills, with a 48 px ✕ that hides it on this phone', fr.bills.join() === 'false,free,true,48' && fr.closed.join() === 'true,{"bills":1}', [fr.bills, fr.closed]);
  t.check('free: a hint in Prices opens the shop sheet', fr.prices.join() === 'false,true' && fr.go.join() === 'false,true', [fr.prices, fr.go]);
  t.check('free: the shop sheet lists three uses and the offer; register leads, login waits behind its button', fr.offer.join() === '30 ദിവസം സൗജന്യം · പിന്നെ മാസം ₹199,3,true,false,true' && fr.login.join() === 'false,true,shopCode,false', [fr.offer, fr.login]);
  await t.reload(); await ready(t);
  const fr2 = await t.evaluate(() => { openBills(); const r = [document.getElementById('billsNote').hidden]; billsEl.close(); openPrices(); r.push(document.getElementById('pricesNote').hidden); pricesEl.close(); return r; });
  t.check('a closed hint stays closed after a reload; the other still shows', fr2.join() === 'true,false', fr2);
  localStorage.removeItem('thraasu_hints');
```
  (`localStorage` calls outside `t.evaluate` are written as `await t.evaluate(() => localStorage.removeItem('thraasu_hints'))`.)

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: CSS**, after the `.note-x` rule:

```css
.uses { display: grid; gap: 12px; list-style: none; }
.uses li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.4; color: var(--ink-2); }
.uses b { display: block; font-size: 16px; font-weight: 680; color: var(--ink); }
.use-ico { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--leaf-wash); color: var(--leaf-deep); }
.use-ico svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
```

- [ ] **Step 4: Signed-out box HTML:**

```html
    <section class="box" id="signedOut">
      <h3>കടയുടെ അക്കൗണ്ട്</h3>
      <p>അക്കൗണ്ട് ഉണ്ടെങ്കിൽ:</p>
      <ul class="uses">
        <li><span class="use-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="7.5" height="15" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="15" rx="1.5"/><path d="M6 16h1.5M16.5 16h1.5"/></svg></span><span><b>എല്ലാ ഫോണിലും ഒരേ വില</b>ഒരു ഫോണിൽ മാറ്റിയാൽ എല്ലാ ഫോണിലും മാറും; ഫോൺ മാറിയാലും ഒന്നും പോകില്ല.</span></li>
        <li><span class="use-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9.5 8h5M9.5 11.5h5M9.5 15h3"/></svg></span><span><b>എല്ലാ ഫോണിലെയും ബില്ലുകൾ ഒരിടത്ത്</b>ഏതു ഫോണിൽ ബിൽ ചെയ്താലും ഒരേ നമ്പർ നിര; ക്യാഷ്, UPI, കടം വേറെ വേറെ കാണാം.</span></li>
        <li><span class="use-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/></svg></span><span><b>വിൽക്കുന്നതനുസരിച്ച് സ്റ്റോക്ക്</b>ബിൽ ചെയ്യുമ്പോൾ സ്റ്റോക്ക് തനിയെ കുറയും.</span></li>
      </ul>
      <p class="fee" id="offerLine"></p>
      <p class="req" id="reqNote" role="status" hidden></p>
      <form id="loginForm" novalidate hidden>
        (the existing two fields, #loginMsg and #loginBtn, unchanged)
      </form>
      <button class="btn primary" id="signupOpen" type="button">പുതിയ കട രജിസ്റ്റർ ചെയ്യുക</button>
      <button class="btn ghost" id="loginOpen" type="button">കോഡ് ഉണ്ടെങ്കിൽ ലോഗിൻ ചെയ്യുക</button>
    </section>
```

- [ ] **Step 5: Script.** The `feeLine` line becomes `$('feeLine').textContent = $('offerLine').textContent = OFFER;`, and:

```js
$('loginOpen').addEventListener('click', () => { loginOpen = true; renderSync(); $('shopCode').focus(); });
```
  In `renderSync`, after the `reqNote` lines (one leaf button per surface: register yields it to Login):

```js
  $('loginForm').hidden = !(loginOpen || req); $('loginOpen').hidden = !$('loginForm').hidden;
  $('signupOpen').classList.toggle('primary', $('loginForm').hidden); $('signupOpen').classList.toggle('ghost', !$('loginForm').hidden);
```

- [ ] **Step 6: Run, expect pass**, including the existing sign-up and shop-account checks.

- [ ] **Step 7: Commit** (when Karthik says go).

### Task 6: Privacy page, cache, whole-repo checks

**Files:** `8_thraasu/privacy.html`, `8_thraasu/service-worker.js`, `scripts/browser/tests/privacy.mjs` (if it pins the fee text)

- [ ] **Step 1:** `privacy.html`: `<h2 id="delete">4. Deleting your data</h2>`, and the fee paragraph becomes:
  `<p>The app needs no account. A shop account is free for 30 days from approval, then ₹199 a month, paid to us
  directly, never in the app. When an account runs out nothing is deleted: its phones carry on alone, and sync
  resumes once it is renewed.</p>`
- [ ] **Step 2:** `service-worker.js`: `const CACHE_NAME = 'thraasu-v17';`
- [ ] **Step 3:** Run every gate: `bash scripts/build-site.sh`; `for t in [1-8]_*/test-*.mjs; do node "$t"; done`;
  `bash scripts/browser-smoke.sh`; `node --check` on the extracted inline script. All pass, or the failure is
  recorded and fixed before going on.

### Task 7: Records, then the live rollout (only on Karthik's go)

- [ ] **Step 1: Records.** `NEXT_STEPS.md` Thraasu block: the fee sentence becomes the paid account (30 days,
  ₹199, `paid CODE +30`, `list` sorted by date, grace 5 + 5, consumption-only), plus a §6 real-phone line for
  the paused flow; §4's "needs a privacy.html" goes (it exists). `8_thraasu/PRODUCT.md` Capabilities: the shop
  account is paid. `EXECUTION_PLAN.md` §0.4: one audit row. Brain log entry and Status line.
- [ ] **Step 2: Live.** `node 8_thraasu/tools/shop-admin.mjs list` (NANMA the only active shop) → run
  `migrate-paid.sql` on the live D1 → `list` shows NANMA `paid_through 2027-03-31` → commit only this work
  (shared files by hunk) → push → `bash scripts/verify-deploy.sh` → a throwaway shop: `add ZZPAID "Paid test"`,
  login + `GET state` has `paid`; `UPDATE shops SET paid_until = 1 WHERE code = 'ZZPAID'` → `GET state` 402,
  `POST logout` 200; `paid ZZPAID +30` → 200 → `remove ZZPAID`.
