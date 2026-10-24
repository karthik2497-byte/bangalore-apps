# Thraasu shared bills and payment kind — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every logged-in phone of a shop shows the same bills of today and yesterday; every bill records how it
was paid (cash, UPI, credit), picked before it can be finished; the bills sheet filters by that.

**Architecture:** `cleanBill` in `bill-core.js` (and its twin in the Pages Function) defines a kept bill. The
Function gains D1 `bills` + `shops.bills_at` (a strictly increasing per-shop counter) with `POST bills` and
`GET bills?since=`. The phone queues every sold-bill save in `outbox.bills`, pushes, then pulls when the counter
moved and merges into `kept`. UI: a three-segment toggle under ആകെ (required for print/share/പുതിയ ബിൽ), a
പണം row on the receipt, filter chips and row badges in the bills sheet, the toggle again in a kept bill's view.

**Tech Stack:** single-file PWA (inline JS, no build), Cloudflare Pages Function + D1, `node:sqlite` and
headless Chrome (CDP) test harnesses already in the repo.

Spec: `docs/superpowers/specs/2026-10-24-thraasu-shared-bills-payment-design.md`.

## Global Constraints

- Labels: ക്യാഷ് · UPI (`lang="en"`) · കടം; row label പണം; need text "ആദ്യം പണം തിരഞ്ഞെടുക്കൂ".
- Colours: cash leaf / leaf-deep / leaf-wash; UPI `--upi: #34367A`, `--upi-wash: #E1E1F2`; credit brass-ink /
  brass-wash; chilli only for the not-picked error.
- Kinds stored as `'cash' | 'upi' | 'credit'`, or `null`.
- Server: at most 50 bills per `POST bills`; a bill keeps ≤ 300 lines; rows older than 3 days (by `started`) go.
- Every localStorage key `thraasu_`; touch targets ≥ 48 px; works at 320 px wide.
- No commits or pushes without Karthik's go-ahead; the tree is shared with another session (stage only these files).

## File map

| File | Change |
|---|---|
| `8_thraasu/bill-core.js` | `PAY_KINDS`, `cleanBill` |
| `8_thraasu/test-bill.mjs` | `cleanBill` checks |
| `functions/api/thraasu/[[path]].js` | server `cleanBill`, `POST bills`, `GET bills`, `state.bills` |
| `8_thraasu/tools/schema.sql`, `migrate-bills.sql` (new) | table `bills`, `shops.bills_at` |
| `8_thraasu/test-sync.mjs` | bills route checks |
| `8_thraasu/tools/shop-admin.mjs` | `remove` deletes bills |
| `8_thraasu/index.html` | payment toggle, receipt row, sync of bills, filter, badges, kept-bill toggle |
| `scripts/browser/tests/thraasu.mjs` | updated flows + new checks |
| `8_thraasu/service-worker.js` | `thraasu-v16` |
| `8_thraasu/privacy.html`, `DESIGN.md`, `PRODUCT.md`, `NEXT_STEPS.md`, `EXECUTION_PLAN.md` | records |

---

### Task 1: `cleanBill` and `PAY_KINDS` in bill-core

**Files:** Modify `8_thraasu/bill-core.js` (after `cleanItem`); Test `8_thraasu/test-bill.mjs`.

**Interfaces — Produces:** `PAY_KINDS: string[]`; `cleanBill(b) → {id, no, started, discount, pay, lines:[{ml, qty, unit, rate, sample}]} | null`.

- [ ] **Step 1: failing test** — add `PAY_KINDS, cleanBill` to the vm export list and `cleanBill` to the `plain` list, then:

```js
t('a kept bill keeps its receipt fields and payment; anything else is refused', () => {
  const ok = { id: 'b-1', no: 7, started: '2026-10-24T05:12:00.000Z', discount: 500, pay: 'upi', sold: true,
    lines: [{ pid: 'tomato', ml: 'തക്കാളി', qty: 500, unit: 'kg', rate: 4000, sample: false, img: 'img/t.webp' }, { ml: 'പാൽ', qty: 2, unit: 'pc', rate: 2800 }] };
  assert.deepEqual(cleanBill(ok), { id: 'b-1', no: 7, started: '2026-10-24T05:12:00.000Z', discount: 500, pay: 'upi',
    lines: [{ ml: 'തക്കാളി', qty: 500, unit: 'kg', rate: 4000, sample: false }, { ml: 'പാൽ', qty: 2, unit: 'pc', rate: 2800, sample: true }] });
  assert.equal(cleanBill({ ...ok, pay: 'card' }).pay, null);           // unknown kind, or kept before payments
  assert.equal(cleanBill({ ...ok, discount: -1 }).discount, 0);
  assert.deepEqual(cleanBill({ ...ok, lines: [] }).lines, []);         // every line taken off: a removal, still a bill
  assert.equal(cleanBill({ ...ok, lines: [{ ...ok.lines[0], ml: 'x'.repeat(130) }] }).lines[0].ml.length, 120);
  for (const bad of [null, 'x', { ...ok, id: 'a b' }, { ...ok, no: 0 }, { ...ok, no: 1.5 }, { ...ok, started: 'soon' },
    { ...ok, lines: 'x' }, { ...ok, lines: Array(301).fill(ok.lines[1]) }, { ...ok, lines: [{ ...ok.lines[0], qty: 0 }] },
    { ...ok, lines: [{ ...ok.lines[0], unit: 'g' }] }, { ...ok, lines: [{ ...ok.lines[0], rate: 1e9 }] }, { ...ok, lines: [{ ...ok.lines[0], ml: ' ' }] }])
    assert.equal(cleanBill(bad), null, JSON.stringify(bad).slice(0, 80));
  assert.deepEqual([...core.PAY_KINDS], ['cash', 'upi', 'credit']);
});
```

- [ ] **Step 2:** `node 8_thraasu/test-bill.mjs` → FAIL (`cleanBill is not defined`).
- [ ] **Step 3: implement** (after `cleanItem`):

```js
// How a bill was paid: cash, UPI, or credit (paid later). A bill is sold only with one; a bill kept before
// payments existed has none (null).
const PAY_KINDS = ['cash', 'upi', 'credit'];

// A sold bill as the bills sheet keeps it, on the phone and on the shop's server (functions/api/thraasu keeps
// the same rules): what its receipt needs and how it was paid. No lines is a bill whose lines were all taken
// off, sent so the shop's other phones drop it too. Null for anything that is not a bill.
function cleanBill(b) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !/^[\w-]{1,40}$/.test(b.id) || !Number.isInteger(b.no) ||
    b.no < 1 || b.no > 1e6 || typeof b.started !== 'string' || !Number.isFinite(Date.parse(b.started)) ||
    !Array.isArray(b.lines) || b.lines.length > 300) return null;
  const lines = [];
  for (const l of b.lines) {
    if (!l || typeof l.ml !== 'string' || !l.ml.trim() || !Object.hasOwn(UNITS, l.unit) || !Number.isInteger(l.qty) ||
      l.qty < 1 || l.qty > MAX_QTY || !Number.isInteger(l.rate) || l.rate < 1 || l.rate >= 1e9) return null;
    lines.push({ ml: l.ml.slice(0, 120), qty: l.qty, unit: l.unit, rate: l.rate, sample: l.sample !== false });
  }
  return { id: b.id, no: b.no, started: b.started, discount: Number.isInteger(b.discount) && b.discount > 0 && b.discount < 1e9 ? b.discount : 0,
    pay: PAY_KINDS.includes(b.pay) ? b.pay : null, lines };
}
```

- [ ] **Step 4:** `node 8_thraasu/test-bill.mjs` → `OK: N checks passed`.

### Task 2: the server keeps the shop's bills

**Files:** Modify `functions/api/thraasu/[[path]].js`, `8_thraasu/tools/schema.sql`, `8_thraasu/tools/shop-admin.mjs`;
Create `8_thraasu/tools/migrate-bills.sql`; Test `8_thraasu/test-sync.mjs`.

**Interfaces — Produces:** `POST bills {bills: {id: bill}}` → `{ok}` (413 over 50); `GET bills?since=N` →
`{at, bills: [{id, bill}]}`; `GET state` adds `bills` (number | null).

- [ ] **Step 1: failing test** — add `['POST', 'bills'], ['GET', 'bills']` to the 401 list, and before "unknown routes":

```js
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
  const before = await state(a);                                                  // two writes in one millisecond still count
  await send(a, { k1: bill('k1', 1, 'cash') }); await send(a, { k1: bill('k1', 1, 'upi') });
  assert.ok(await state(a) >= before + 2);
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
```

- [ ] **Step 2:** `node 8_thraasu/test-sync.mjs` → FAIL (404 / no such table).
- [ ] **Step 3: schema** — `schema.sql`: shops gains `bills_at INTEGER` (comment: last change to the shop's bills),
  then:

```sql
-- The shop's sold bills of the last three days, as every phone's bills sheet shows them (body: cleanBill JSON;
-- no lines: removed). at: the shop's bills_at when written, so a phone pulls only what changed since.
CREATE TABLE IF NOT EXISTS bills (shop TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, started INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (shop, id));
CREATE INDEX IF NOT EXISTS bills_at ON bills (shop, at);
```

  `migrate-bills.sql` (new): the comment header as in `migrate-hidden.sql`, `ALTER TABLE shops ADD COLUMN bills_at INTEGER;`
  and the two statements above.
- [ ] **Step 4: Function** — constants `KEPT_PER_POST = 50`, `BILLS_KEEP_MS = 3 * 864e5`; server `cleanBill(id, b)`
  (same rules as Task 1, plus `b.id === id` and `ID.test(id)`); in `GET state` select `bills_at` and return
  `bills: s.bills_at ?? null`; routes:

```js
    case 'POST bills': {
      // {bills: {id: bill}}: each sold bill, sent again on every change; last write wins per bill. Every write moves
      // the shop's bills_at forward (MAX(old + 1, now): strictly, so equal always means unchanged) and stamps it on
      // the rows, so GET bills?since= hands a phone only what changed after its last pull.
      const b = await readJson(request), now = Date.now();
      const all = Object.entries(b?.bills && typeof b.bills === 'object' ? b.bills : {});
      if (all.length > KEPT_PER_POST) return json({ error: 'too many' }, 413);
      const keep = {};
      for (const [id, x] of all) {
        const c = cleanBill(id, x), started = c && Date.parse(c.started);
        if (c && started >= now - BILLS_KEEP_MS) keep[id] = { body: JSON.stringify(c), started };
      }
      if (!Object.keys(keep).length) return json({ ok: true });
      await db.batch([
        db.prepare('DELETE FROM bills WHERE shop = ? AND started < ?').bind(shop, now - BILLS_KEEP_MS),
        db.prepare('UPDATE shops SET bills_at = MAX(COALESCE(bills_at, 0) + 1, ?) WHERE code = ?').bind(now, shop),
        db.prepare("INSERT INTO bills (shop, id, body, started, at) SELECT ?, key, json_extract(value, '$.body'), json_extract(value, '$.started'), " +
          '(SELECT bills_at FROM shops WHERE code = ?) FROM json_each(?) WHERE true ' +
          'ON CONFLICT (shop, id) DO UPDATE SET body = excluded.body, started = excluded.started, at = excluded.at').bind(shop, shop, JSON.stringify(keep)),
      ]);
      return json({ ok: true });
    }
    case 'GET bills': {
      // The counter before the rows: a write landing between the two comes again next time, never skipped.
      const since = Number(new URL(request.url).searchParams.get('since')) || 0;
      const at = await db.prepare('SELECT bills_at FROM shops WHERE code = ?').bind(shop).first('bills_at');
      const r = await db.prepare('SELECT id, body FROM bills WHERE shop = ? AND at > ? AND started >= ? ORDER BY at, id')
        .bind(shop, since, Date.now() - BILLS_KEEP_MS).all();
      return json({ at: at ?? null, bills: r.results.map(x => ({ id: x.id, bill: JSON.parse(x.body) })) });
    }
```

- [ ] **Step 5:** `shop-admin.mjs remove`: add `'bills WHERE shop'` and "bills" to its message.
- [ ] **Step 6:** `node 8_thraasu/test-sync.mjs` → `OK`.

### Task 3: the payment on the counter's bill, required to finish it

**Files:** Modify `8_thraasu/index.html`; Test `scripts/browser/tests/thraasu.mjs`.

**Interfaces — Consumes:** `PAY_KINDS`. **Produces:** `PAY_LABEL`, `PAY_ICON`, `payButtons(all)`, `payTag(kind)`,
`bill.pay`, `needPay() → boolean`, receipt `pay` row.

- [ ] **Step 1: failing tests** — the print check clicks print, share and പുതിയ ബിൽ with no payment and expects
  nothing finished, the row in its need state and the focus on ക്യാഷ്; then picks UPI and prints; the receipt
  matches `/പണംUPI/`. In the kept-bills flow set `bill.pay = 'cash'` before the second `newBill()`; in the sync
  flow call `newBill()` once without a payment (expect `bill.sold === false`), then set `bill.pay = 'upi'`.
  Sizes: the first segment of `#paySeg` ≥ 48 px.
- [ ] **Step 2:** `bash scripts/browser-smoke.sh thraasu` → FAIL on the new checks.
- [ ] **Step 3: implement** — CSS tokens `--upi`, `--upi-wash`; the payment CSS block; in the slip after `#sums`:

```html
    <div class="pay-row" id="payRow" hidden>
      <span class="pay-label" id="payLabel">പണം</span>
      <div class="pay-seg" id="paySeg" role="group" aria-labelledby="payLabel" aria-describedby="payNeed"></div>
      <p class="pay-need" id="payNeed" hidden>ആദ്യം പണം തിരഞ്ഞെടുക്കൂ</p>
    </div>
```

  JS: `freshBill` gets `pay: null`, `loadBill` keeps a known kind; `PAY_LABEL`, `PAY_ICON`, `payButtons`, `payTag`;
  `needPay()` (scroll the row to centre, focus its first segment, show the need line); `printBill`/`shareBill`
  (`if (b === bill) { if (needPay()) return; markSold(); }`) and `newBill` (`if (!bill.lines.length || needPay()) return;`);
  `renderBill` hides the row on an empty bill, sets `aria-pressed`, clears the need state once picked; the
  segment click sets `bill.pay`, `saveBill()`, `renderBill()`; `receiptData` gains `pay`, rendered after ആകെ in
  `receiptHTML` and `receiptCanvas`; start fills `#paySeg`.
- [ ] **Step 4:** `bash scripts/browser-smoke.sh thraasu` → PASS.

### Task 4: the shop's bills on every phone

**Files:** Modify `8_thraasu/index.html`; Test `scripts/browser/tests/thraasu.mjs` (fake server gains `POST bills`,
`GET bills`, `state.bills`).

**Interfaces — Consumes:** `cleanBill`, `POST/GET bills`. **Produces:** `keptForm(b)`, `outbox.bills`, `mergeBills(list) → boolean`, `refreshBills()`.

- [ ] **Step 1: failing tests** in the sync flow: a sold bill reaches the server with its payment; emptied, it is
  removed there and here; another phone's bill comes down and the next number follows it; a payment changed on
  another phone reaches the counter's bill; a change made offline wins over the server's copy; an unfinished
  bill whose number another phone took moves on; logout leaves no kept bills.
- [ ] **Step 2:** smoke → FAIL.
- [ ] **Step 3: implement** — `keptForm`; `keep`/`loadKept` through `cleanBill`; `saveBill` queues `'bill'`;
  `freshOutbox.bills`, `pending`, `queue`; in `sync`: push-once of kept bills while `!('bills' in synced)`, push in
  fifties after sales, pull when `st.bills` differs from `synced.bills`, `mergeBills`, `synced.bills`; `signOut(true)`
  clears `kept`; `openBills` syncs; `refreshBills` after a sync that brought bills.
- [ ] **Step 4:** smoke → PASS.

### Task 5: filter, badges, and the payment on a kept bill

**Files:** Modify `8_thraasu/index.html`; Test `scripts/browser/tests/thraasu.mjs`.

- [ ] **Step 1: failing tests** (logged out, after the kept-bills reload): subtitle "· ഈ ഫോണിൽ"; chips
  എല്ലാം (picked) ക്യാഷ് UPI കടം; badges ക്യാഷ്, UPI and none; UPI shows only 0001 with "1 ബിൽ · ₹250" and
  "ഇന്നലെ UPI ബില്ലുകളൊന്നുമില്ല"; കടം shows none for both days; reopening resets to എല്ലാം; chips ≥ 48 px;
  a kept bill shows its payment on the slip and in its toggle, and changing it saves and keeps the focus.
  Existing row regex allows the badge text. Logged in (sync flow): subtitle "· കടയിലെ എല്ലാ ഫോണിലും"; changing the
  counter's bill from its kept view changes `bill.pay` and queues it.
- [ ] **Step 2:** smoke → FAIL.
- [ ] **Step 3: implement** — `#payFilter` under the bills head, `#pastPay` + `#pastPayNote` in the kept-bill footer;
  CSS for chips, tags, heading colour, footer rows; `payFilter` state reset in `openBills`; `renderBills` filters
  and adds `payTag`; `showPast` hides the chips, sets the subtitle, calls `renderPast()`; `setPastPay(kind)`.
- [ ] **Step 4:** smoke → PASS.

### Task 6: records, cache, full verification

- [ ] `service-worker.js` → `thraasu-v16`.
- [ ] `privacy.html`: summary, the bills bullet, the Malayalam line, "Last updated: 24 October 2026".
- [ ] `DESIGN.md` (tokens `upi`, `upi-wash`; Payment colours; chilli rule; Payment toggle; bills sheet),
  `PRODUCT.md` (capability line), `NEXT_STEPS.md` (§3 bills line, §6 real-phone check), `EXECUTION_PLAN.md` §0.4 row.
- [ ] Run: `for t in [1-8]_*/test-*.mjs; do node "$t"; done`, `bash scripts/browser-smoke.sh`, `bash scripts/build-site.sh`.

### Task 7: deploy (only after Karthik's go-ahead)

- [ ] `npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-bills.sql` (before the push).
- [ ] Commit only this work (shared tree), push `main`, then `bash scripts/verify-deploy.sh`; one live round trip
  of `POST/GET bills` with a throwaway shop, removed after.
